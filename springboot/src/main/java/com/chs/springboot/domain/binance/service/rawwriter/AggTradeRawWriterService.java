package com.chs.springboot.domain.binance.service.rawwriter;

import com.chs.springboot.domain.binance.model.AggTradeCollectStatus;
import com.chs.springboot.domain.binance.model.RawAggTrade;
import com.chs.springboot.domain.binance.repository.AggTradeCollectStatusRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
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
    private final boolean dryRun;
    private final AggTradeRawWriterWriteMode writeMode;

    public AggTradeRawWriterService(JdbcTemplate jdbcTemplate,
                                    StringRedisTemplate redisTemplate,
                                    AggTradeCollectStatusRepository statusRepository,
                                    ObjectMapper objectMapper,
                                    AggTradeRawWriterDryRunVerifier dryRunVerifier,
                                    @Value("${binance.agg-trade.raw-writer.dry-run:true}") boolean dryRun,
                                    @Value("${binance.agg-trade.raw-writer.write-mode:dry-run}") String writeMode) {
        this.jdbcTemplate = jdbcTemplate;
        this.redisTemplate = redisTemplate;
        this.statusRepository = statusRepository;
        this.objectMapper = objectMapper;
        this.dryRunVerifier = dryRunVerifier;
        this.dryRun = dryRun;
        this.writeMode = AggTradeRawWriterWriteMode.from(dryRun ? "dry-run" : writeMode);
    }

    public void writeBatch(List<AggTradeRawWriterMessage> messages) {
        if (messages == null || messages.isEmpty()) {
            return;
        }
        List<RawAggTrade> trades = messages.stream()
                .map(this::parse)
                .toList();

        if (writeMode == AggTradeRawWriterWriteMode.DRY_RUN) {
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

        batchInsert(trades);
        if (writeMode.updatesCheckpoint()) {
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

    private void batchInsert(List<RawAggTrade> trades) {
        if (trades.isEmpty()) {
            return;
        }
        String sql = "INSERT IGNORE INTO " + writeMode.tableName() + " " +
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
