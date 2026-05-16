package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * KafkaPipelineState 를 실제 실행 파라미터 집합으로 변환한 결과.
 * Consumer / Service / Verifier 가 이 plan 하나만 보고 동작을 결정한다.
 * state 별 매핑은 {@link #from(KafkaPipelineState, String, String)} 참고.
 */
record KafkaPipelineExecutionPlan(
        String mode,             // 외부 노출용 라벨 ("off" / "dry-run" / "debug" / "live"). UI/응답에 그대로 노출.
        boolean enabled,         // Kafka consume 수행 여부. false 면 listener 가 메시지를 즉시 무시.
        boolean dryRun,          // true 면 DB INSERT 대신 dry-run verifier 에만 누적.
        String targetTable,      // INSERT 대상 테이블명. dry-run / off 일 때는 null.
        boolean updateCheckpoint // checkpoint(redis/상태 테이블) 갱신 여부. LIVE 만 true. 그 외는 실데이터 영향 없음.
) {
    /**
     * 상태값 -> 실행 플랜 매핑.
     *
     * <pre>
     * OFF     : 아무것도 안 함.
     * DRY_RUN : consume 만 함. DB 미터치.
     * DEBUG   : consume + debugTable(예: raw_agg_trade_test) INSERT. checkpoint 갱신 X (실 운영 데이터 무영향).
     * LIVE    : consume + liveTable(예: raw_agg_trade) INSERT + checkpoint 갱신. 실제 서비스 모드.
     * </pre>
     */
    static KafkaPipelineExecutionPlan from(KafkaPipelineState state, String liveTable, String debugTable) {
        return switch (state) {
            case OFF -> new KafkaPipelineExecutionPlan("off", false, false, null, false);
            case DRY_RUN -> new KafkaPipelineExecutionPlan("dry-run", true, true, null, false);
            case DEBUG -> new KafkaPipelineExecutionPlan("debug", true, false, debugTable, false);
            case LIVE -> new KafkaPipelineExecutionPlan("live", true, false, liveTable, true);
        };
    }
}
