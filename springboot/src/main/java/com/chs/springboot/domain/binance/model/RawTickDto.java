// [AGENT] 실시간 틱 SSE 전송용 DTO | 연관파일: RawTickSseService.java, BinanceTradeService.java
package com.chs.springboot.domain.binance.model;

/**
 * 틱 테이블용 최소 필드: 가격, 수량, 방향, 시장타입.
 */
public record RawTickDto(
        String price,
        String quantity,
        boolean isBuyerMaker,
        String marketType
) {}
