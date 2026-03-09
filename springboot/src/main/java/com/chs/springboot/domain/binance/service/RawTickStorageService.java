// [AGENT] 역할: Redis 공유 큐 기반 RawTick 수집 — 모든 서버가 RPUSH, 리더만 LPOP·배치 DB 저장 | 연관파일: RawTick.java, BinanceTradeService.java, LeaderElectionService.java, TelegramLog.java
// 주요메서드: enqueue(), scheduleFlush(), sendAlert(), isCooldownPassed(), tryAlertOverflow/InsertFail/QueueWarn(), batchInsert(), destroy()(@PreDestroy)
package com.chs.springboot.domain.binance.service;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import com.chs.springboot.domain.binance.model.RawTick;
import com.chs.springboot.global.redis.LeaderElectionService;
import com.chs.springboot.global.telegram.TelegramLog;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.InetAddress;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class RawTickStorageService {

    private static final Logger log = LoggerFactory.getLogger(RawTickStorageService.class);

    private static final String REDIS_QUEUE_KEY = "rawtick:queue";
    private static final String REDIS_DEDUP_KEY_PREFIX = "rawtick:dedup:";
    /** Enqueue 시 중복 판별용 키 만료 시간(초). 이 시간 지나면 같은 tradeId도 다시 큐에 넣을 수 있음. */
    private static final int DEDUP_TTL_SEC = 60;
    private static final int MAX_REDIS_QUEUE = 50_000;
    private static final int FLUSH_INTERVAL_SEC = 10;
    private static final int ALERT_COOLDOWN_SEC = 60;
    private static final String REDIS_KEY_OVERFLOW = "rawtick:alert:overflow";
    private static final String REDIS_KEY_INS_FAIL = "rawtick:alert:insert-fail";
    private static final int LPOP_COUNT = 10_000;
    /** 큐 적체 텔레그램 알림 구간: 60%, 90% */
    private static final int QUEUE_WARN_60_PCT = (int) (MAX_REDIS_QUEUE * 0.60);
    private static final int QUEUE_WARN_90_PCT = (int) (MAX_REDIS_QUEUE * 0.90);

    private final StringRedisTemplate redisTemplate;
    private final JdbcTemplate jdbcTemplate;
    private final LeaderElectionService leaderElection;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${binance.tick-trade.save.enabled:true}")
    private boolean tickTradeSaveEnabled;

    private final ConcurrentHashMap<String, Long> lastAlertTime = new ConcurrentHashMap<>();
    private final ScheduledExecutorService flushExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "rawtick-flush");
        t.setDaemon(false);
        return t;
    });

    public RawTickStorageService(StringRedisTemplate redisTemplate,
                                 JdbcTemplate jdbcTemplate,
                                 LeaderElectionService leaderElection) {
        this.redisTemplate = redisTemplate;
        this.jdbcTemplate = jdbcTemplate;
        this.leaderElection = leaderElection;
        flushExecutor.scheduleWithFixedDelay(this::scheduleFlush, FLUSH_INTERVAL_SEC, FLUSH_INTERVAL_SEC, TimeUnit.SECONDS);
    }

    @PostConstruct
    private void logBatchSetting() {
        try {
            var ds = jdbcTemplate.getDataSource();
            if (ds instanceof HikariDataSource hikari) {
                String url = hikari.getJdbcUrl() != null ? hikari.getJdbcUrl() : "";
                boolean rewrite = url.contains("rewriteBatchedStatements=true");
                log.info("[RawTick] JDBC rewriteBatchedStatements in URL: {} (배치 성능에 영향)", rewrite);
            } else {
                log.info("[RawTick] DataSource is not Hikari, JDBC URL 확인 불가");
            }
        } catch (Exception e) {
            log.warn("[RawTick] 배치 설정 로그 실패: {}", e.getMessage());
        }
        try {
            LoggerContext ctx = (LoggerContext) LoggerFactory.getILoggerFactory();
            ch.qos.logback.classic.Logger rootLogger = ctx.getLogger(ch.qos.logback.classic.Logger.ROOT_LOGGER_NAME);
            ch.qos.logback.classic.Logger binanceLogger = ctx.getLogger("com.chs.springboot.domain.binance.service.BinanceTradeService");
            Level rootLevel = rootLogger.getEffectiveLevel();
            Level binanceLevel = binanceLogger.getEffectiveLevel();
            log.info("[RawTick] 시작 시 로그 레벨 - root: {}, BinanceTradeService: {}", rootLevel, binanceLevel);
        } catch (Exception e) {
            log.warn("[RawTick] 로그 레벨 조회 실패: {}", e.getMessage());
        }
    }

    /** Producer: 모든 서버에서 WS 수신 시 호출. Redis SET NX+TTL로 중복 제거 후 RPUSH. */
    public void enqueue(String json, String marketType) {
        try {
            long tradeId;
            try {
                tradeId = objectMapper.readTree(json).get("t").asLong();
            } catch (Exception e) {
                log.warn("[RawTick] enqueue tradeId 파싱 실패, 큐에 그대로 적재: {}", e.getMessage());
                tradeId = -1;
            }
            if (tradeId >= 0) {
                String dedupKey = REDIS_DEDUP_KEY_PREFIX + marketType + ":" + tradeId;
                Boolean added = redisTemplate.opsForValue().setIfAbsent(dedupKey, "1", Duration.ofSeconds(DEDUP_TTL_SEC));
                if (!Boolean.TRUE.equals(added)) {
                    log.debug("[RawTick] enqueue 건너뜀(중복): {} tradeId={}", marketType, tradeId);
                    return;
                }
            }
            String value = objectMapper.writeValueAsString(new QueueItem(marketType, json));
            Long newSize = redisTemplate.opsForList().rightPush(REDIS_QUEUE_KEY, value);
            if (newSize == null) return;
            if (newSize > MAX_REDIS_QUEUE) {
                redisTemplate.opsForList().trim(REDIS_QUEUE_KEY, -MAX_REDIS_QUEUE, -1);
                tryAlertOverflow();
            } else if (newSize >= QUEUE_WARN_90_PCT) {
                tryAlertQueueWarn(90, newSize.intValue());
            } else if (newSize >= QUEUE_WARN_60_PCT) {
                tryAlertQueueWarn(60, newSize.intValue());
            }
        } catch (Exception e) {
            log.error("[RawTick] enqueue 실패: {}", e.getMessage());
        }
    }

    /** Consumer: 10초마다 리더에서만 실행. 큐가 빌 때까지 반복 LPOP·저장. */
    private void scheduleFlush() {
        try {
            if (!tickTradeSaveEnabled || !leaderElection.isLeader()) return;
            int totalSaved = 0;
            long runStartMs = System.currentTimeMillis();
            while (true) {
                long t0 = System.currentTimeMillis();
                List<String> values = redisTemplate.opsForList().leftPop(REDIS_QUEUE_KEY, LPOP_COUNT);
                long t1 = System.currentTimeMillis();
                if (values == null || values.isEmpty()) break;
                long startMs = System.currentTimeMillis();
                List<RawTick> entities = new ArrayList<>(values.size());
                for (String value : values) {
                    try {
                        QueueItem item = objectMapper.readValue(value, QueueItem.class);
                        RawTick tick = parseToRawTick(item.json(), item.marketType());
                        if (tick != null) entities.add(tick);
                    } catch (Exception e) {
                        log.warn("[RawTick] 파싱 스킵: {}", e.getMessage());
                    }
                }
                long t2 = System.currentTimeMillis();
                if (!entities.isEmpty()) {
                    batchInsert(entities, startMs);
                    long t3 = System.currentTimeMillis();
                    totalSaved += entities.size();
                    log.info("[RawTick] 배치 저장: LPOP {}ms, 파싱 {}ms, insert {}ms | {}건", t1 - t0, t2 - startMs, t3 - t2, entities.size());
                }
                if (values.size() < LPOP_COUNT) break;
            } // while end
            if (totalSaved > LPOP_COUNT) {
                log.info("[RawTick] 이번 회차 총 저장: {}건, {}ms (10초대기 없이 바로 insert)", totalSaved, System.currentTimeMillis() - runStartMs);
                if (totalSaved >= LPOP_COUNT) {
                    flushExecutor.schedule(this::scheduleFlush, 0, TimeUnit.SECONDS);
                }
            }
        } catch (Exception e) {
            log.error("[RawTick] scheduleFlush 실패: {}", e.getMessage());
        }
    }

    private RawTick parseToRawTick(String json, String marketType) throws Exception {
        JsonNode node = objectMapper.readTree(json);
        RawTick tick = new RawTick();
        tick.setMarketType(marketType);
        tick.setTradeId(node.get("t").asLong());
        tick.setPrice(new BigDecimal(node.get("p").asText()));
        tick.setQuantity(new BigDecimal(node.get("q").asText()));
        tick.setIsBuyerMaker(node.get("m").asBoolean());
        tick.setTradedAt(node.get("T").asLong());
        return tick;
    }

    private void batchInsert(List<RawTick> entities, long startMs) {
        String sql = "INSERT INTO raw_tick (market_type, trade_id, price, quantity, is_buyer_maker, traded_at, saved_at) VALUES (?, ?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE id = id";
        try {
            jdbcTemplate.batchUpdate(sql, new BatchPreparedStatementSetter() {
                @Override
                public void setValues(java.sql.PreparedStatement ps, int i) throws java.sql.SQLException {
                    RawTick t = entities.get(i);
                    ps.setString(1, t.getMarketType());
                    ps.setLong(2, t.getTradeId());
                    ps.setBigDecimal(3, t.getPrice());
                    ps.setBigDecimal(4, t.getQuantity());
                    ps.setBoolean(5, Boolean.TRUE.equals(t.getIsBuyerMaker()));
                    ps.setLong(6, t.getTradedAt());
                }
                @Override
                public int getBatchSize() { return entities.size(); }
            });
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - startMs;
            log.error("[RawTick] 배치 insert 실패: {}건, {}ms", entities.size(), elapsed, e);
            tryAlertInsertFail(entities.size(), elapsed);
            throw e;
        }
    }

    private void sendAlert(String message) {
        try {
            String host = InetAddress.getLocalHost().getHostName();
            String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("MM-dd HH:mm:ss"));
            TelegramLog.error("[🚨ERROR][" + host + " / " + time + "] " + message);
        } catch (Exception e) {
            log.warn("[RawTick] 알림 발송 실패: {}", e.getMessage());
        }
    }

    private boolean isCooldownPassed(String key) {
        try {
            Boolean set = redisTemplate.opsForValue().setIfAbsent(key, "1", Duration.ofSeconds(ALERT_COOLDOWN_SEC));
            return !Boolean.FALSE.equals(set);
        } catch (Exception e) {
            log.warn("[RawTick] Redis 쿨다운 실패, 인메모리 폴백: {}", e.getMessage());
            long now = System.currentTimeMillis();
            Long last = lastAlertTime.get(key);
            if (last != null && now - last < ALERT_COOLDOWN_SEC * 1000L) return false;
            lastAlertTime.put(key, now);
            return true;
        }
    }

    private void tryAlertOverflow() {
        if (!isCooldownPassed(REDIS_KEY_OVERFLOW)) return;
        sendAlert("큐 오버플로우 — 오래된 틱 드롭 중");
    }

    private void tryAlertInsertFail(int count, long elapsedMs) {
        if (!isCooldownPassed(REDIS_KEY_INS_FAIL)) return;
        sendAlert("배치 insert 실패: " + count + "건, " + elapsedMs + "ms");
    }

    private void tryAlertQueueWarn(int pct, int newSize) {
        String redisKey = "rawtick:alert:queue-warn:" + pct;
        if (!isCooldownPassed(redisKey)) return;
        sendAlert("큐 " + newSize + "건 — " + pct + "%");
    }

    @PreDestroy
    public void destroy() {
        flushExecutor.shutdown();
        try {
            if (!flushExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                flushExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            flushExecutor.shutdownNow();
        }
    }

    private record QueueItem(String marketType, String json) {}
}
