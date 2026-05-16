package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.Locale;

enum AggTradeRawWriterWriteMode {
    DRY_RUN(null, false),
    SHADOW("raw_agg_trade_test", false),
    LIVE("raw_agg_trade", true);

    private final String tableName;
    private final boolean updatesCheckpoint;

    AggTradeRawWriterWriteMode(String tableName, boolean updatesCheckpoint) {
        this.tableName = tableName;
        this.updatesCheckpoint = updatesCheckpoint;
    }

    static AggTradeRawWriterWriteMode from(String value) {
        String normalized = value == null ? "" : value.trim().replace('-', '_').toUpperCase(Locale.ROOT);
        for (AggTradeRawWriterWriteMode mode : values()) {
            if (mode.name().equals(normalized)) {
                return mode;
            }
        }
        throw new IllegalArgumentException("Unsupported raw-writer write mode: " + value);
    }

    String tableName() {
        return tableName;
    }

    boolean updatesCheckpoint() {
        return updatesCheckpoint;
    }
}
