package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.RawAggTrade;
import com.chs.springboot.global.redis.LeaderElectionService;
import com.chs.springboot.global.telegram.TelegramLog;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class AggTradeStorageService {

    private static final Logger log = LoggerFactory.getLogger(AggTradeStorageService.class);

    private static final String QUEUE_KEY = "aggtrade:queue";
    private static final String DEDUP_KEY_PREFIX = "dedup:aggtrade:";

    private final StringRedisTemplate redisTemplate;
    private final JdbcTemplate jdbcTemplate;
    private final AggTradeConfigService configService;
    private final LeaderElectionService leaderElectionService;
    private final AggTradeBackfillService backfillService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${binance.agg-trade.save.enabled:true}")
    private boolean aggTradeSaveEnabled;

    private final ScheduledExecutorService flushExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "aggtrade-flush");
        t.setDaemon(false);
        return t;
    });

    public AggTradeStorageService(StringRedisTemplate redisTemplate,
                                  JdbcTemplate jdbcTemplate,
                                  AggTradeConfigService configService,
                                  LeaderElectionService leaderElectionService,
                                  AggTradeBackfillService backfillService) {
        this.redisTemplate = redisTemplate;
        this.jdbcTemplate = jdbcTemplate;
        this.configService = configService;
        this.leaderElectionService = leaderElectionService;
        this.backfillService = backfillService;
    }

    public ScheduledExecutorService getFlushExecutor() {
        return flushExecutor;
    }

    /**
     * WebSocket 수신 시 호출 — Redis SETNX dedup 후 큐에 적재.
     */
    public void enqueue(String json, String symbol, String marketType) {
        if (!aggTradeSaveEnabled) {
            return;
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            long aggTradeId = node.get("a").asLong();

            String dedupKey = DEDUP_KEY_PREFIX + symbol + ":" + marketType + ":" + aggTradeId;
            int dedupTtl = configService.getDedupTtlSec();
            Boolean added = redisTemplate.opsForValue()
                    .setIfAbsent(dedupKey, "1", Duration.ofSeconds(dedupTtl));
            if (!Boolean.TRUE.equals(added)) {
                return;
            }

            int maxQueueSize = configService.getMaxQueueSize();
            Long currentSize = redisTemplate.opsForList().size(QUEUE_KEY);
            if (currentSize != null && currentSize >= maxQueueSize) {
                TelegramLog.error("[AggTrade] 큐 오버플로우 — enqueue 차단, size=" + currentSize);
                return;
            }

            String value = objectMapper.writeValueAsString(new QueueItem(symbol, marketType, json));
            Long newSize = redisTemplate.opsForList().rightPush(QUEUE_KEY, value);
            if (newSize == null) {
                return;
            }

            int warning60 = (int) (maxQueueSize * 0.6);
            int warning90 = (int) (maxQueueSize * 0.9);
            if (newSize >= warning90) {
                TelegramLog.error("[AggTrade] 큐 90% 경고 — size=" + newSize);
            } else if (newSize >= warning60) {
                TelegramLog.info("[AggTrade] 큐 60% 경고 — size=" + newSize);
            }

            int flushThreshold = configService.getFlushThreshold();
            if (newSize >= flushThreshold) {
                flushExecutor.submit(this::doFlush);
                backfillService.rescheduleMinutes(4);
            }
        } catch (Exception e) {
            log.error("[AggTrade] enqueue 실패: {}", e.getMessage());
        }
    }

    /**
     * 단일 스레드 executor에서만 실행되는 flush 로직.
     */
    public void doFlush() {
        if (!aggTradeSaveEnabled || !leaderElectionService.isLeader()) {
            return;
        }
        try {
            int batchSize = configService.getBatchSize();
            while (true) {
                List<String> values = redisTemplate.opsForList().leftPop(QUEUE_KEY, batchSize);
                if (values == null || values.isEmpty()) {
                    break;
                }
                List<RawAggTrade> entities = new ArrayList<>(values.size());
                for (String value : values) {
                    try {
                        QueueItem item = objectMapper.readValue(value, QueueItem.class);
                        RawAggTrade trade = parseToEntity(item);
                        if (trade != null) {
                            entities.add(trade);
                        }
                    } catch (Exception ex) {
                        log.info("[AggTrade] 파싱 스킵: {}", ex.getMessage());
                    }
                }
                if (!entities.isEmpty()) {
                    long startMs = System.currentTimeMillis();
                    try {
                        batchInsert(entities, startMs);
                        updateCheckpoints(entities);

                        Long remain = redisTemplate.opsForList().size(QUEUE_KEY);
                        long remainCount = remain != null ? remain : -1L;

                        var bySymbolMarket = entities.stream()
                                .collect(java.util.stream.Collectors.groupingBy(
                                        e -> e.getSymbol() + "/" + e.getMarketType(),
                                        java.util.stream.Collectors.counting()
                                ));

                        log.info("[AggTradeFlush] 배치 insert 완료: {}건, 큐 잔여={}, bySymbolMarket={}",
                                entities.size(), remainCount, bySymbolMarket);
                    } catch (Exception ex) {
                        long elapsed = System.currentTimeMillis() - startMs;
                        log.error("[AggTrade] 배치 insert 실패: {}건, {}ms", entities.size(), elapsed, ex);
                        TelegramLog.error("[AggTrade] 배치 insert 실패: " + entities.size() + "건, " + elapsed + "ms");
                    }
                }
                if (values.size() < batchSize) {
                    break;
                }
            }
        } catch (Exception e) {
            log.error("[AggTrade] doFlush 실패: {}", e.getMessage());
        }
    }

    private RawAggTrade parseToEntity(QueueItem item) throws Exception {
        JsonNode node = objectMapper.readTree(item.json());
        RawAggTrade trade = new RawAggTrade();
        trade.setSymbol(item.symbol());
        trade.setMarketType(item.marketType());
        trade.setAggTradeId(node.get("a").asLong());
        trade.setPrice(new BigDecimal(node.get("p").asText()));
        trade.setQuantity(new BigDecimal(node.get("q").asText()));
        trade.setFirstTradeId(node.get("f").asLong());
        trade.setLastTradeId(node.get("l").asLong());
        trade.setIsBuyerMaker(node.get("m").asBoolean());
        trade.setTradedAt(node.get("T").asLong());
        return trade;
    }

    private void updateCheckpoints(List<RawAggTrade> entities) {
        entities.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        e -> e.getSymbol() + ":" + e.getMarketType(),
                        java.util.stream.Collectors.mapping(RawAggTrade::getAggTradeId, java.util.stream.Collectors.maxBy(Long::compareTo))
                ))
                .forEach((key, maxIdOpt) -> maxIdOpt.ifPresent(maxId -> {
                    String[] parts = key.split(":");
                    if (parts.length != 2) return;
                    String symbol = parts[0];
                    String marketType = parts[1];
                    String checkpointKey = "aggtrade:checkpoint:" + symbol + ":" + marketType;
                    setIfGreater(checkpointKey, maxId);
                }));
    }

    private void setIfGreater(String key, Long newValue) {
        try {
            String current = redisTemplate.opsForValue().get(key);
            if (current == null) {
                redisTemplate.opsForValue().set(key, String.valueOf(newValue));
                return;
            }
            long currentVal = Long.parseLong(current);
            if (newValue > currentVal) {
                redisTemplate.opsForValue().set(key, String.valueOf(newValue));
            }
        } catch (Exception e) {
            log.warn("[AggTrade] checkpoint 갱신 실패: {}", e.getMessage());
        }
    }

    private void batchInsert(List<RawAggTrade> entities, long startMs) {
        String sql = "INSERT INTO raw_agg_trade " +
                "(symbol, market_type, agg_trade_id, price, quantity, first_trade_id, last_trade_id, is_buyer_maker, traded_at, saved_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6)) " +
                "ON DUPLICATE KEY UPDATE id = id";

        jdbcTemplate.batchUpdate(sql, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                RawAggTrade t = entities.get(i);
                ps.setString(1, t.getSymbol());
                ps.setString(2, t.getMarketType());
                ps.setLong(3, t.getAggTradeId());
                ps.setBigDecimal(4, t.getPrice());
                ps.setBigDecimal(5, t.getQuantity());
                ps.setLong(6, t.getFirstTradeId());
                ps.setLong(7, t.getLastTradeId());
                ps.setBoolean(8, Boolean.TRUE.equals(t.getIsBuyerMaker()));
                ps.setLong(9, t.getTradedAt());
            }

            @Override
            public int getBatchSize() {
                return entities.size();
            }
        });
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

    private record QueueItem(String symbol, String marketType, String json) {
    }
}

