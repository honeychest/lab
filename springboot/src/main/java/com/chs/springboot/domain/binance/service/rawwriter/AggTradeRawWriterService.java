package com.chs.springboot.domain.binance.service.rawwriter;

import com.chs.springboot.domain.binance.model.AggTradeCollectStatus;
import com.chs.springboot.domain.binance.model.RawAggTrade;
import com.chs.springboot.domain.binance.repository.AggTradeCollectStatusRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.BatchPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class AggTradeRawWriterService {

    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;
    private final AggTradeCollectStatusRepository statusRepository;
    private final ObjectMapper objectMapper;
    private final AggTradeRawWriterDryRunVerifier dryRunVerifier;
    private final KafkaPipelineSwitchboard switchboard;

    public AggTradeRawWriterService(JdbcTemplate jdbcTemplate,
                                    StringRedisTemplate redisTemplate,
                                    AggTradeCollectStatusRepository statusRepository,
                                    ObjectMapper objectMapper,
                                    AggTradeRawWriterDryRunVerifier dryRunVerifier,
                                    KafkaPipelineSwitchboard switchboard) {
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
        this.statusRepository = statusRepository;
        this.objectMapper = objectMapper;
        this.dryRunVerifier = dryRunVerifier;
        this.switchboard = switchboard;
    }

    /**
     * Kafka consumer 로부터 받은 메시지 배치를 현재 pipeline state 에 따라 분기 처리한다.
     *
     * <p>분기 규칙:
     * <ul>
     *   <li>plan.enabled() == false (OFF)             : 아무것도 하지 않고 즉시 종료.</li>
     *   <li>plan.dryRun() == true (DRY_RUN)           : DB 미터치. dryRunVerifier 에만 윈도우 누적.</li>
     *   <li>그 외 (DEBUG / LIVE)                       : plan.targetTable() 에 batch INSERT.</li>
     *   <li>plan.updateCheckpoint() == true (LIVE only): redis/status 테이블 checkpoint 갱신.</li>
     * </ul>
     *
     * <p>주의: parse 는 enabled 여부와 무관하게 항상 수행한다. parse 실패(잘못된 메시지)는 plan 과 무관하게
     * 항상 예외를 던져 컨슈머 쪽에서 dead-letter 처리하도록 두기 위함.</p>
     */
    public void writeBatch(List<AggTradeRawWriterMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return;
        }
        KafkaPipelineExecutionPlan plan = switchboard.aggTradeRawWriterPlan();
        List<RawAggTrade> trades = messages.stream()
                .map(this::parse)
                .toList();

        if (!plan.enabled()) {
            return;
        }

        if (plan.dryRun()) {
            trades.forEach(trade -> dryRunVerifier.accumulate(new AggTradeRawWriterKafkaWindowEvent(
                    trade.getSymbol(),
                    trade.getMarketType(),
                    trade.getTradedAt(),
                    trade.getAggTradeId(),
                    0
            )));
            long latestTradedAt = trades.stream()
                    .map(RawAggTrade::getTradedAt)
                    .max(Long::compareTo)
                    .orElse(0L);
            dryRunVerifier.finalizeWindowsBefore(windowStart(latestTradedAt));
            return;
        }

        batchInsert(plan.targetTable(), trades);
        if (plan.updateCheckpoint()) {
            updateCheckpoints(trades);
        }
    }

    private RawAggTrade parse(AggTradeRawWriterMessage message) {
        try {
            JsonNode envelope = objectMapper.readTree(message.value());
            String symbol = requiredText(envelope, "symbol");
            String marketType = requiredText(envelope, "marketType");
            JsonNode payload = envelope.get("payload");
            if (payload == null || !payload.isObject()) {
                throw invalid("Missing payload");
            }
            validateKey(message.key(), symbol, marketType);

            RawAggTrade trade = new RawAggTrade();
            trade.setSymbol(symbol);
            trade.setMarketType(marketType);
            trade.setAggTradeId(requiredPositiveLong(payload, "a"));
            trade.setPrice(requiredPositiveDecimal(payload, "p"));
            trade.setQuantity(requiredPositiveDecimal(payload, "q"));
            trade.setFirstTradeId(requiredLong(payload, "f"));
            trade.setLastTradeId(requiredLong(payload, "l"));
            trade.setIsBuyerMaker(requiredBoolean(payload, "m"));
            trade.setTradedAt(requiredPositiveLong(payload, "T"));
            return trade;
        } catch (InvalidAggTradeRawMessageException e) {
            throw e;
        } catch (Exception e) {
            throw new InvalidAggTradeRawMessageException("Invalid aggTrade raw message", e);
        }
    }

    private void validateKey(String key, String symbol, String marketType) {
        if (key == null || key.isBlank()) {
            return;
        }
        String expected = symbol + "|" + marketType;
        if (!expected.equals(key)) {
            throw invalid("Key mismatch expected=" + expected + " actual=" + key);
        }
    }

    private String requiredText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.asText().isBlank()) {
            throw invalid("Missing " + field);
        }
        return value.asText();
    }

    private long requiredLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.canConvertToLong()) {
            throw invalid("Missing " + field);
        }
        return value.asLong();
    }

    private long requiredPositiveLong(JsonNode node, String field) {
        long value = requiredLong(node, field);
        if (value <= 0) {
            throw invalid(field + " must be positive");
        }
        return value;
    }

    private BigDecimal requiredPositiveDecimal(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.asText().isBlank()) {
            throw invalid("Missing " + field);
        }
        BigDecimal decimal;
        try {
            decimal = new BigDecimal(value.asText());
        } catch (NumberFormatException e) {
            throw invalid(field + " must be decimal");
        }
        if (decimal.signum() <= 0) {
            throw invalid(field + " must be positive");
        }
        return decimal;
    }

    private boolean requiredBoolean(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isBoolean()) {
            throw invalid("Missing " + field);
        }
        return value.asBoolean();
    }

    private InvalidAggTradeRawMessageException invalid(String message) {
        return new InvalidAggTradeRawMessageException(message);
    }

    private long windowStart(long tradedAt) {
        return tradedAt - (tradedAt % 10_000L);
    }

    private Long min(List<RawAggTrade> trades, java.util.function.Function<RawAggTrade, Long> getter) {
        return trades.stream().map(getter).min(Comparator.naturalOrder()).orElse(null);
    }

    private Long max(List<RawAggTrade> trades, java.util.function.Function<RawAggTrade, Long> getter) {
        return trades.stream().map(getter).max(Comparator.naturalOrder()).orElse(null);
    }

    /**
     * targetTable 에 trades 를 batch INSERT 한다.
     * targetTable 은 plan 이 결정한 값(DEBUG=raw_agg_trade_test / LIVE=raw_agg_trade)으로,
     * 외부 입력이 아닌 enum 매핑 결과라 SQL injection 위험 없음.
     * INSERT IGNORE: agg_trade_id 중복 시 silent skip (재처리/오프셋 되감기 안전).
     */
    private void batchInsert(String targetTable, List<RawAggTrade> trades) {
        if (trades.isEmpty()) {
            return;
        }
        String sql = "INSERT IGNORE INTO " + targetTable + " " +
                "(symbol, market_type, agg_trade_id, price, quantity, first_trade_id, last_trade_id, is_buyer_maker, traded_at, saved_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))";
        jdbcTemplate.batchUpdate(sql, new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                RawAggTrade t = trades.get(i);
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
                return trades.size();
            }
        });
    }

    /**
     * LIVE 모드에서만 호출된다. symbol+marketType 별 최대 aggTradeId 를
     * redis 와 status 테이블 양쪽에 기록한다.
     * - redis 키: aggtrade:checkpoint:{symbol}:{marketType} (실시간 hot path 용)
     * - status 테이블 lastStreamAggId : backfill/관제용 영속 저장
     * 기존 값보다 작은 id 는 무시 (offset 되감기/재처리시 checkpoint 후퇴 방지).
     */
    private void updateCheckpoints(List<RawAggTrade> trades) {
        Map<String, List<RawAggTrade>> bySymbolMarket = trades.stream()
                .collect(Collectors.groupingBy(t -> t.getSymbol() + ":" + t.getMarketType()));
        bySymbolMarket.forEach((key, group) -> {
            String[] parts = key.split(":");
            if (parts.length != 2) {
                return;
            }
            String symbol = parts[0];
            String marketType = parts[1];
            Long maxId = max(group, RawAggTrade::getAggTradeId);
            if (maxId == null) {
                return;
            }
            redisTemplate.opsForValue().set("aggtrade:checkpoint:" + symbol + ":" + marketType, String.valueOf(maxId));
            AggTradeCollectStatus status = statusRepository.findBySymbolAndMarketType(symbol, marketType)
                    .orElseGet(() -> {
                        AggTradeCollectStatus created = new AggTradeCollectStatus();
                        created.setSymbol(symbol);
                        created.setMarketType(marketType);
                        created.setEnabled(Boolean.TRUE);
                        created.setBackfillIntervalMin(1);
                        return created;
                    });
            Long current = status.getLastStreamAggId();
            if (current == null || maxId > current) {
                status.setLastStreamAggId(maxId);
            }
            statusRepository.save(status);
        });
    }
}
