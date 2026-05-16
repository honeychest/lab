package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * Kafka raw aggTrade record key.
 *
 * <p>현재 producer key 포맷은 {@code symbol|marketType} 이다.</p>
 */
public record AggTradeRecordKey(String symbol, String marketType) {

    private static final String UNKNOWN = "UNKNOWN";

    public static AggTradeRecordKey parseOrUnknown(String key) {
        if (key == null || key.isBlank()) {
            return unknown();
        }
        String[] parts = key.split("\\|", 2);
        if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
            return unknown();
        }
        return new AggTradeRecordKey(parts[0], parts[1]);
    }

    public static void validateNullable(String key, String symbol, String marketType) {
        if (key == null || key.isBlank()) {
            return;
        }
        AggTradeRecordKey parsed = parseOrUnknown(key);
        if (UNKNOWN.equals(parsed.symbol()) || !parsed.matches(symbol, marketType)) {
            throw new InvalidAggTradeRawMessageException(
                    "Key mismatch expected=" + format(symbol, marketType) + " actual=" + key
            );
        }
    }

    public static String format(String symbol, String marketType) {
        return symbol + "|" + marketType;
    }

    private static AggTradeRecordKey unknown() {
        return new AggTradeRecordKey(UNKNOWN, UNKNOWN);
    }

    private boolean matches(String expectedSymbol, String expectedMarketType) {
        return symbol.equals(expectedSymbol) && marketType.equals(expectedMarketType);
    }
}
