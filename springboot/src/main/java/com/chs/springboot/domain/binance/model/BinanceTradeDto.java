// [AGENT] SSE/REST 응답용 BTC 체결 DTO | 연관파일: BinanceTrade.java, BinanceTradeSseService.java, BinanceTradeQueryService.java
package com.chs.springboot.domain.binance.model;

import java.math.BigDecimal;

public record BinanceTradeDto(
        Long id,
        String symbol,
        String marketType,
        BigDecimal price,
        BigDecimal quantity,
        BigDecimal tradeValue,
        Boolean isBuyerMaker,
        Long tradedAt
) {
    public static BinanceTradeDto from(BinanceTrade trade) {
        return new BinanceTradeDto(
                trade.getId(),
                trade.getSymbol(),
                trade.getMarketType(),
                trade.getPrice(),
                trade.getQuantity(),
                trade.getTradeValue(),
                trade.getIsBuyerMaker(),
                trade.getTradedAt()
        );
    }
}
