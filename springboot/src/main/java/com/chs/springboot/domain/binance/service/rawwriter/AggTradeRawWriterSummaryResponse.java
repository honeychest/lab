package com.chs.springboot.domain.binance.service.rawwriter;

import java.util.List;

/**
 * raw-writer 상태 및 DryRun 비교 결과를 담는 REST 응답 record.
 */
public record AggTradeRawWriterSummaryResponse(
        String mode,        // 파이프라인 모드 (OFF / DRY_RUN / DEBUG / LIVE)
        boolean enabled,    // 파이프라인 활성 여부
        boolean dryRun,     // DryRun 모드 여부
        String targetTable, // 실제 쓰기 대상 테이블 (LIVE/DEBUG 일 때만 non-null)
        List<AggTradeRawWriterDryRunSummary> summaries // 최근 윈도우 비교 결과 목록
) {
    /** 테스트·문서용 샘플 응답을 반환한다. */
    public static AggTradeRawWriterSummaryResponse sampleComparedWindow() {
        return new AggTradeRawWriterSummaryResponse(
                "dry-run",
                true,
                true,
                null,
                List.of(new AggTradeRawWriterDryRunSummary(
                        "sample",
                        1778410000000L,
                        1778410010000L,
                        "BTCUSDT",
                        "SPOT",
                        412,
                        412,
                        100L,
                        511L,
                        100L,
                        511L,
                        1778410000100L,
                        1778410009800L,
                        1778410000100L,
                        1778410009800L,
                        0,
                        List.of(100L, 511L),
                        true,
                        true,
                        false,
                        "OK"
                ))
        );
    }
}
