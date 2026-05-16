package com.chs.springboot.global.admin.test.shadow;

public enum TableShadowProfile {
    AGG_TRADE_RAW(
            "agg-trade-raw",
            "raw_agg_trade",
            "raw_agg_trade_test",
            "symbol",
            "market_type",
            "agg_trade_id",
            "traded_at"
    );

    private final String id;
    private final String rawTable;
    private final String shadowTable;
    private final String symbolColumn;
    private final String marketTypeColumn;
    private final String sequenceColumn;
    private final String timeColumn;

    TableShadowProfile(String id,
                       String rawTable,
                       String shadowTable,
                       String symbolColumn,
                       String marketTypeColumn,
                       String sequenceColumn,
                       String timeColumn) {
        this.id = id;
        this.rawTable = rawTable;
        this.shadowTable = shadowTable;
        this.symbolColumn = symbolColumn;
        this.marketTypeColumn = marketTypeColumn;
        this.sequenceColumn = sequenceColumn;
        this.timeColumn = timeColumn;
    }

    public String id() {
        return id;
    }

    String rawTable() {
        return rawTable;
    }

    String shadowTable() {
        return shadowTable;
    }

    String symbolColumn() {
        return symbolColumn;
    }

    String marketTypeColumn() {
        return marketTypeColumn;
    }

    String sequenceColumn() {
        return sequenceColumn;
    }

    String timeColumn() {
        return timeColumn;
    }
}
