package com.chs.springboot.domain.binance.service.rawwriter;

/**
 * Kafka raw-writer 파이프라인의 동작 상태.
 * 운영 중 전환은 코드 수정 + 재배포가 필요하다. (KafkaPipelineSwitchboard 의 상수로 박혀있음)
 *
 * 단계 의도: OFF -> DRY_RUN -> DEBUG -> LIVE 순서로 검증 강도를 올려가며 승급한다.
 */
enum KafkaPipelineState {
    OFF,        // 기능 정지. Kafka consume 자체를 하지 않음. DB INSERT/checkpoint 갱신 없음.
    DRY_RUN,    // Kafka consume 하지만 DB INSERT 없음. 파싱/검증 summary 만 누적. (장애 영향 0, 가장 안전)
    DEBUG,      // shadow 모드. _test 테이블에 INSERT. checkpoint 갱신은 안 함. (실데이터에 영향 없음, 적재 정합성 검증용)
    LIVE        // 운영 모드. 실 테이블에 INSERT + checkpoint 갱신. 실제 서비스 적재.
}
