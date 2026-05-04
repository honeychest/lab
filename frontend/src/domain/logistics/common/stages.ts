import type { LogisticsTask, TaskStage, OmsStage, InboundStage, WmsOutStage, TmsStage, OmsReceiveNodeKey, TmsWorkNodeKey } from './events';

export const OMS_STAGES: OmsStage[] = [
    'OMS_RECEIVED',
    'OMS_VALIDATED',
    'OMS_WMS_REQUESTED',
];

export type OmsReceiveWorkNode = {
    key: string;
    label: string;
    summary: string;
    signal: string;
    output: string;
    stage: number;
    dlog: string;
    handoff: string;
};

// 1 tick = 100ms. 모든 단계/세부 노드가 같은 기준 시간을 참조한다.
export const LOGISTICS_STAGE_TICKS = 30;
export const OMS_RECEIVE_NODE_TICKS = LOGISTICS_STAGE_TICKS;
export const TMS_WORK_NODE_TICKS = LOGISTICS_STAGE_TICKS;

export const OMS_RECEIVE_WORK_NODES: OmsReceiveWorkNode[] = [
    {
        key: 'raw-ingest',
        label: '주문 원문 수신',
        summary: '외부 채널에서 들어온 주문 원문을 접수 큐에 올립니다.',
        signal: '원문 누락, 채널 불명',
        output: '접수 이벤트',
        stage: 2,
        dlog: 'OmsReceive.rawIngest — 주문 원문 수신/채널 payload 보존 구현 지점',
        handoff: '채널, 원문 ID, 수신 시각',
    },
    {
        key: 'owner-match',
        label: '화주·채널 식별',
        summary: '화주와 유입 채널을 계약 범위에 맞춰 식별합니다.',
        signal: '미등록 화주, 계약 불일치',
        output: 'owner key',
        stage: 2,
        dlog: 'OmsReceive.ownerMatch — 화주/채널/계약 식별 구현 지점',
        handoff: 'owner key, 계약 정책',
    },
    {
        key: 'required-fields',
        label: '필수값 검사',
        summary: '품목, 수량, 도착지, 외부 주문키를 확인합니다.',
        signal: '필수값 누락, 형식 오류',
        output: '검증 후보',
        stage: 2,
        dlog: 'OmsReceive.requiredFields — OMS 접수 필수값 검증 구현 지점',
        handoff: '검증 결과, 반려 사유',
    },
    {
        key: 'duplicate-check',
        label: '중복 주문 탐지',
        summary: '외부 주문번호를 접수 이력과 대조해 중복을 막습니다.',
        signal: '재전송, 멱등 충돌',
        output: '중복 판정',
        stage: 2,
        dlog: 'OmsReceive.duplicateCheck — 중복 주문 탐지/멱등 처리 구현 지점',
        handoff: '중복 여부, 기존 taskId',
    },
    {
        key: 'receipt-key',
        label: '접수키 발급',
        summary: '작업 추적용 taskId와 traceId를 만들고 이력 체인을 시작합니다.',
        signal: '키 충돌, 추적 단절',
        output: 'taskId / traceId',
        stage: 2,
        dlog: 'OmsReceive.receiptKey — 접수키/추적키 발급 구현 지점',
        handoff: 'taskId, traceId, event seed',
    },
    {
        key: 'sla-classify',
        label: 'SLA 분류',
        summary: '주문 긴급도와 SLA 등급을 분류해 처리 우선순위를 부여합니다.',
        signal: 'SLA 정책 불명, 등급 미지정',
        output: 'SLA 등급',
        stage: 3,
        dlog: 'OmsReceive.slaClassify — 화주 계약 SLA 등급/우선순위 분류 구현 지점',
        handoff: 'SLA 등급, 처리 우선순위',
    },
    {
        key: 'next-queue',
        label: '검증 큐 등록',
        summary: '다음 검증 레인이 집어갈 이벤트를 생성합니다.',
        signal: '큐 적재 실패, 이벤트 유실',
        output: '검증 대기 작업',
        stage: 2,
        dlog: 'OmsReceive.nextQueue — OMS 검증 큐 등록/이벤트 발행 구현 지점',
        handoff: 'validation queue event',
    },
];

export const OMS_VALIDATE_WORK_NODES: OmsReceiveWorkNode[] = [
    {
        key: 'contract-rule',
        label: '계약 조건 확인',
        summary: '화주 계약과 주문 채널 허용 범위를 확인합니다.',
        signal: '계약 불일치',
        output: '계약 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.contractRule — 화주 계약/채널 정책 검증 구현 지점',
        handoff: '계약 ID, 허용 채널',
    },
    {
        key: 'item-rule',
        label: '품목 정책 확인',
        summary: '품목 코드와 취급 가능 조건을 확인합니다.',
        signal: '미등록 품목',
        output: '품목 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.itemRule — 품목 정책/취급 가능 조건 구현 지점',
        handoff: 'item policy, 보관 온도',
    },
    {
        key: 'quantity-rule',
        label: '수량·단위 확인',
        summary: '주문 수량과 단위가 처리 가능한 범위인지 확인합니다.',
        signal: '수량 초과, 단위 오류',
        output: '수량 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.quantityRule — 수량/단위 검증 구현 지점',
        handoff: '수량 범위, 단위',
    },
    {
        key: 'destination-rule',
        label: '배송지 가능권 확인',
        summary: '배송지와 서비스 가능 권역을 대조합니다.',
        signal: '권역 불가',
        output: '배송지 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.destinationRule — 배송 가능 권역 검증 구현 지점',
        handoff: '권역 코드, 제한 사유',
    },
    {
        key: 'payment-check',
        label: '결제 상태 확인',
        summary: '주문에 연결된 결제 상태를 확인해 미결제/취소 건을 걸러냅니다.',
        signal: '결제 미확인, 결제 취소',
        output: '결제 상태',
        stage: 3,
        dlog: 'OmsValidate.paymentCheck — 결제 상태 조회/미결제 반려 구현 지점',
        handoff: '결제 ID, 결제 상태',
    },
    {
        key: 'audit-ready',
        label: '검증 감사 기록',
        summary: '검증 결과와 반려 후보를 감사 로그로 남깁니다.',
        signal: '감사 누락',
        output: '검증 완료 이벤트',
        stage: 2,
        dlog: 'OmsValidate.auditReady — 검증 감사 로그/반려 사유 구현 지점',
        handoff: '검증 결과, 감사 로그',
    },
];

export const OMS_WMS_REQUEST_WORK_NODES: OmsReceiveWorkNode[] = [
    {
        key: 'shipment-build',
        label: '출고 요청 구성',
        summary: '검증된 주문을 WMS 출고 요청 payload로 구성합니다.',
        signal: 'payload 누락',
        output: 'shipment request',
        stage: 2,
        dlog: 'OmsWmsRequest.shipmentBuild — WMS 출고 요청 payload 구성 구현 지점',
        handoff: '출고 요청 payload',
    },
    {
        key: 'inventory-hint',
        label: '재고 힌트 첨부',
        summary: '후속 WMS 할당에 필요한 품목·수량 힌트를 붙입니다.',
        signal: '품목 힌트 누락',
        output: 'allocation hint',
        stage: 2,
        dlog: 'OmsWmsRequest.inventoryHint — 재고 할당 힌트 구성 구현 지점',
        handoff: '품목, 수량, 온도대',
    },
    {
        key: 'event-envelope',
        label: '이벤트 봉투 생성',
        summary: 'routingKey, trace, idempotency 정보를 묶습니다.',
        signal: 'trace 단절',
        output: 'event envelope',
        stage: 2,
        dlog: 'OmsWmsRequest.eventEnvelope — 이벤트 봉투/멱등키 구현 지점',
        handoff: 'routingKey, traceId, idempotencyKey',
    },
    {
        key: 'broker-send',
        label: 'WMS 이벤트 발행',
        summary: 'WMS가 수신할 출고 요청 이벤트를 발행합니다.',
        signal: '브로커 발행 실패',
        output: 'order.wms.requested',
        stage: 2,
        dlog: 'OmsWmsRequest.brokerSend — MQ/WS 이벤트 발행 구현 지점',
        handoff: '발행 결과, 재시도 키',
    },
    {
        key: 'handoff-watch',
        label: '승계 확인',
        summary: 'WMS 접수 카드 생성 여부를 확인할 추적점을 남깁니다.',
        signal: 'WMS 미수신',
        output: 'WMS 접수 대기',
        stage: 2,
        dlog: 'OmsWmsRequest.handoffWatch — WMS 수신 확인/미수신 보상 구현 지점',
        handoff: 'WMS 수신 상태',
    },
];

export const OMS_STAGE_WORK_NODES: Record<OmsStage, OmsReceiveWorkNode[]> = {
    OMS_RECEIVED: OMS_RECEIVE_WORK_NODES,
    OMS_VALIDATED: OMS_VALIDATE_WORK_NODES,
    OMS_WMS_REQUESTED: OMS_WMS_REQUEST_WORK_NODES,
};

export type TmsWorkNode = {
    key: string;
    label: string;
    summary: string;
    signal: string;
    output: string;
    stage: number;
    dlog: string;
    handoff: string;
};

const TMS_REQUESTED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'dispatch-ingest',
        label: '배차 요청 접수',
        summary: 'WMS 출하 완료 이벤트를 수신해 배차 요청 작업을 생성합니다.',
        signal: '이벤트 유실, 중복 요청',
        output: '배차 요청 작업',
        stage: 2,
        dlog: 'TmsRequested.dispatchIngest — 배차 요청 이벤트 수신/중복 방지 구현 지점',
        handoff: 'dispatch 요청 ID, 출하 참조 ID',
    },
    {
        key: 'route-calc',
        label: '경로 계산',
        summary: '출발지와 도착지를 기반으로 최적 운송 경로를 산출합니다.',
        signal: '경로 데이터 없음, 도착지 불가',
        output: '추천 경로',
        stage: 3,
        dlog: 'TmsRequested.routeCalc — 경로 최적화/거리 비용 계산 구현 지점',
        handoff: '경로 코드, 예상 거리, 예상 시간',
    },
    {
        key: 'vehicle-match',
        label: '차량 가용성 확인',
        summary: '경로와 화물에 맞는 가용 차량을 조회합니다.',
        signal: '가용 차량 없음, 차량 용량 초과',
        output: '차량 후보 목록',
        stage: 2,
        dlog: 'TmsRequested.vehicleMatch — 차량 가용성/차량 풀 조회 구현 지점',
        handoff: '차량 후보 ID 목록',
    },
    {
        key: 'dispatch-queue',
        label: '배차 대기 등록',
        summary: '배차 확정을 기다리는 대기 큐에 요청을 등록합니다.',
        signal: '큐 적재 실패',
        output: '배차 대기 이벤트',
        stage: 2,
        dlog: 'TmsRequested.dispatchQueue — 배차 대기 큐 등록/이벤트 발행 구현 지점',
        handoff: '배차 대기 이벤트',
    },
];

const TMS_VEHICLE_ASSIGNED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'vehicle-confirm',
        label: '차량 확정',
        summary: '차량 후보 중 하나를 최종 배정 차량으로 확정합니다.',
        signal: '배차 경합, 차량 이미 배정',
        output: '확정 차량 ID',
        stage: 2,
        dlog: 'TmsVehicleAssigned.vehicleConfirm — 차량 최종 확정/경합 처리 구현 지점',
        handoff: '차량 ID, 차량 유형',
    },
    {
        key: 'driver-assign',
        label: '기사 배정',
        summary: '배정 차량에 운전 기사를 연결합니다.',
        signal: '기사 미등록, 기사 부재',
        output: '기사 ID',
        stage: 2,
        dlog: 'TmsVehicleAssigned.driverAssign — 기사 배정/가용성 확인 구현 지점',
        handoff: '기사 ID, 연락처',
    },
    {
        key: 'departure-notify',
        label: '출발 준비 통보',
        summary: '기사와 화주에게 출발 일정과 상차 위치를 통보합니다.',
        signal: '통보 실패',
        output: '통보 이벤트',
        stage: 2,
        dlog: 'TmsVehicleAssigned.departureNotify — 출발 준비 통보/알림 발행 구현 지점',
        handoff: '통보 수신 확인',
    },
];

const TMS_LOADED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'cargo-scan',
        label: '화물 스캔·확인',
        summary: '상차 전 화물 바코드를 스캔해 출하 정보와 일치 여부를 확인합니다.',
        signal: '스캔 불일치, 화물 누락',
        output: '화물 확인 결과',
        stage: 2,
        dlog: 'TmsLoaded.cargoScan — 화물 스캔/출하 정보 대조 구현 지점',
        handoff: '스캔 결과, 박스 ID 목록',
    },
    {
        key: 'load-confirm',
        label: '상차 완료 확인',
        summary: '모든 화물이 차량에 적재됐음을 기사가 확인하고 서명합니다.',
        signal: '서명 누락, 부분 상차',
        output: '상차 완료 이벤트',
        stage: 2,
        dlog: 'TmsLoaded.loadConfirm — 상차 완료 확인/서명 처리 구현 지점',
        handoff: '적재 완료 상태, 기사 서명',
    },
    {
        key: 'departure-signal',
        label: '출발 신호',
        summary: '상차 완료 후 출발을 시스템에 등록하고 운송 추적을 시작합니다.',
        signal: '출발 신호 미수신',
        output: '출발 이벤트',
        stage: 2,
        dlog: 'TmsLoaded.departureSignal — 출발 신호/Track&Trace 시작 구현 지점',
        handoff: '출발 시각, 추적 세션 ID',
    },
];

const TMS_DELIVERING_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'en-route',
        label: '운송 중',
        summary: '차량이 도착지를 향해 이동 중인 구간입니다.',
        signal: '경로 이탈, 장시간 미응답',
        output: '위치 이벤트',
        stage: 3,
        dlog: 'TmsDelivering.enRoute — 운송 중 위치 이벤트/경로 이탈 감지 구현 지점',
        handoff: '현재 위치, 예상 도착',
    },
    {
        key: 'checkpoint',
        label: '중간 체크포인트',
        summary: '중간 경유지 또는 구간 분기에서 위치를 확인합니다.',
        signal: '체크포인트 미통과',
        output: '체크포인트 이벤트',
        stage: 3,
        dlog: 'TmsDelivering.checkpoint — 체크포인트 확인/지연 감지 구현 지점',
        handoff: '체크포인트 ID, 통과 시각',
    },
    {
        key: 'arrival-estimate',
        label: '도착 예정 확인',
        summary: '도착지 인근에서 예상 도착 시각을 확인하고 수취인에게 통보합니다.',
        signal: '수취인 미통보, 도착 지연',
        output: '도착 예정 통보',
        stage: 2,
        dlog: 'TmsDelivering.arrivalEstimate — ETA 계산/수취인 사전 통보 구현 지점',
        handoff: 'ETA, 수취인 통보 상태',
    },
];

const TMS_DELIVERED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'delivery-confirm',
        label: '인도 확인',
        summary: '수취인이 화물을 직접 수령했음을 확인합니다.',
        signal: '수취인 부재, 수령 거부',
        output: '인도 확인 이벤트',
        stage: 2,
        dlog: 'TmsDelivered.deliveryConfirm — 인도 확인/수령 실패 처리 구현 지점',
        handoff: '수령 확인 상태, 수취인 ID',
    },
    {
        key: 'proof-capture',
        label: '서명·증빙 수집',
        summary: '전자 서명 또는 사진 증빙을 수집해 인도 완료 증거로 보관합니다.',
        signal: '증빙 수집 실패',
        output: '증빙 파일',
        stage: 3,
        dlog: 'TmsDelivered.proofCapture — 전자서명/사진 증빙 수집 구현 지점',
        handoff: '증빙 파일 ID',
    },
    {
        key: 'close-order',
        label: '주문 종료',
        summary: '인도 완료 이벤트를 발행하고 전체 주문 흐름을 닫습니다.',
        signal: '종료 이벤트 발행 실패',
        output: 'dispatch.delivered 이벤트',
        stage: 2,
        dlog: 'TmsDelivered.closeOrder — 인도 완료 이벤트 발행/주문 종료 구현 지점',
        handoff: '종료 이벤트, 전체 주문 완료 상태',
    },
];

export const TMS_STAGE_WORK_NODES: Record<TmsStage, TmsWorkNode[]> = {
    TMS_REQUESTED: TMS_REQUESTED_WORK_NODES,
    TMS_VEHICLE_ASSIGNED: TMS_VEHICLE_ASSIGNED_WORK_NODES,
    TMS_LOADED: TMS_LOADED_WORK_NODES,
    TMS_DELIVERING: TMS_DELIVERING_WORK_NODES,
    TMS_DELIVERED: TMS_DELIVERED_WORK_NODES,
};

export function getInitialOmsReceiveNodeKey(): OmsReceiveNodeKey {
    return OMS_RECEIVE_WORK_NODES[0].key as OmsReceiveNodeKey;
}

export function getInitialOmsStageWorkNodeKey(stage: OmsStage): OmsReceiveNodeKey {
    return OMS_STAGE_WORK_NODES[stage][0].key as OmsReceiveNodeKey;
}

export function getNextOmsReceiveNodeKey(key?: OmsReceiveNodeKey): OmsReceiveNodeKey | null {
    const currentIndex = OMS_RECEIVE_WORK_NODES.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (OMS_RECEIVE_WORK_NODES[safeIndex + 1]?.key as OmsReceiveNodeKey | undefined) ?? null;
}

export function getNextOmsStageWorkNodeKey(stage: OmsStage, key?: OmsReceiveNodeKey): OmsReceiveNodeKey | null {
    const nodes = OMS_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (nodes[safeIndex + 1]?.key as OmsReceiveNodeKey | undefined) ?? null;
}

export function getOmsReceiveNodeLabel(key?: OmsReceiveNodeKey): string {
    return OMS_RECEIVE_WORK_NODES.find(node => node.key === key)?.label ?? OMS_RECEIVE_WORK_NODES[0].label;
}

export function getOmsStageWorkNodeLabel(stage: OmsStage, key?: OmsReceiveNodeKey): string {
    const nodes = OMS_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

export function getInitialTmsStageWorkNodeKey(stage: TmsStage): TmsWorkNodeKey {
    return TMS_STAGE_WORK_NODES[stage][0].key as TmsWorkNodeKey;
}

export function getNextTmsStageWorkNodeKey(stage: TmsStage, key?: TmsWorkNodeKey): TmsWorkNodeKey | null {
    const nodes = TMS_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (nodes[safeIndex + 1]?.key as TmsWorkNodeKey | undefined) ?? null;
}

export function getTmsStageWorkNodeLabel(stage: TmsStage, key?: TmsWorkNodeKey): string {
    const nodes = TMS_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

export const INBOUND_STAGES: InboundStage[] = [
    'INBOUND_RECEIVED',
    'INBOUND_VALIDATED',
    'INBOUND_ZONE_ASSIGNED',
    'INBOUND_STORED',
    'INBOUND_COMPLETED',
];

export const WMS_OUT_STAGES: WmsOutStage[] = [
    'WMS_RECEIVED',
    'WMS_ALLOCATED',
    'WMS_PICKING',
    'WMS_PACKED',
    'WMS_DISPATCHED',
    'WMS_DELIVERING',
    'WMS_COMPLETED',
];

export const TMS_STAGES: TmsStage[] = [
    'TMS_REQUESTED',
    'TMS_VEHICLE_ASSIGNED',
    'TMS_LOADED',
    'TMS_DELIVERING',
    'TMS_DELIVERED',
];

export const PIPELINE_STAGES: TaskStage[] = [
    ...OMS_STAGES,
    ...WMS_OUT_STAGES,
    ...TMS_STAGES,
];

export const FINAL_STAGE: TaskStage = 'TMS_DELIVERED';
export const INBOUND_FINAL_STAGE: TaskStage = 'INBOUND_COMPLETED';

export const STAGE_LABELS: Record<TaskStage, string> = {
    OMS_RECEIVED:          '접수',
    OMS_VALIDATED:         '검증',
    OMS_WMS_REQUESTED:     'WMS 전송',
    INBOUND_RECEIVED:      '등록',
    INBOUND_VALIDATED:     '유효성',
    INBOUND_ZONE_ASSIGNED: 'Zone',
    INBOUND_STORED:        '반영',
    INBOUND_COMPLETED:     '완료',
    WMS_RECEIVED:          '접수',
    WMS_ALLOCATED:         '할당',
    WMS_PICKING:           '피킹',
    WMS_PACKED:            '패킹',
    WMS_DISPATCHED:        '출하',
    WMS_DELIVERING:        '운송',
    WMS_COMPLETED:         '완료',
    TMS_REQUESTED:         '배차요청',
    TMS_VEHICLE_ASSIGNED:  '차량배정',
    TMS_LOADED:            '상차',
    TMS_DELIVERING:        '운송',
    TMS_DELIVERED:         '인도',
};

export type StageGuidance = {
    title: string;
    summary: string;
    meaning: string;
    watch: string;
    next: string;
};

export const STAGE_GUIDANCE: Record<TaskStage, StageGuidance> = {
    OMS_RECEIVED: {
        title: '주문 접수 확인',
        summary: '주문이 들어와 처리 흐름에 올라온 상태입니다.',
        meaning: '화주 주문을 OMS가 접수했고, 이제 검증 가능한 업무 단위로 정리하는 중입니다.',
        watch: '화주, 품목, 수량, 도착지 정보가 빠지면 다음 검증에서 멈출 수 있습니다.',
        next: '입력값이 자연스러운지 보고, 이상 신호가 없으면 검증 단계로 넘어가는지 확인합니다.',
    },
    OMS_VALIDATED: {
        title: '주문 조건 검증',
        summary: '주문을 WMS로 넘겨도 되는지 확인하는 상태입니다.',
        meaning: '화주와 품목, 도착지, 수량 조건을 확인해 창고 실행 전에 기본 오류를 걸러냅니다.',
        watch: '검증 실패가 나면 자동 재시도보다 운영자 판단이 먼저 필요합니다.',
        next: '실패 라벨과 조치 버튼을 보고 승인 요청, 반려, 재검증 중 맞는 흐름을 선택합니다.',
    },
    OMS_WMS_REQUESTED: {
        title: 'WMS 작업 요청',
        summary: '검증된 주문을 창고 작업으로 넘기는 상태입니다.',
        meaning: 'OMS 업무가 끝나고 WMS 출고 작업이 만들어지도록 이벤트를 보내는 구간입니다.',
        watch: '전송 실패는 주문 문제가 아니라 연결 또는 메시지 처리 문제일 가능성이 높습니다.',
        next: 'WMS 접수 카드가 생기는지, 실패 시 재시도 또는 DLQ 흐름으로 넘어가는지 봅니다.',
    },
    INBOUND_RECEIVED: {
        title: '입고 등록 접수',
        summary: '입고 요청이 WMS 보조 흐름에 들어온 상태입니다.',
        meaning: 'OMS 관문을 거친 입고 요청이 창고에서 확인 가능한 작업으로 등록됐습니다.',
        watch: '입고는 출고 메인 흐름을 보조하므로, 여기서 오래 머무르면 상류 병목으로 읽습니다.',
        next: '화주와 품목 정보가 맞는지 확인하고 유효성 단계로 이동하는지 봅니다.',
    },
    INBOUND_VALIDATED: {
        title: '입고 정보 검증',
        summary: '입고 자료가 재고에 반영될 수 있는지 확인하는 상태입니다.',
        meaning: '입고 품목과 수량, 화주 정보를 점검해 잘못된 재고 반영을 막습니다.',
        watch: '검증 오류를 놓치면 Zone 배정과 재고 수량이 모두 틀어질 수 있습니다.',
        next: '실패 원인이 데이터 문제인지 운영자 승인 문제인지 먼저 구분합니다.',
    },
    INBOUND_ZONE_ASSIGNED: {
        title: '보관 Zone 배정',
        summary: '입고 상품을 어느 보관 위치로 보낼지 정하는 상태입니다.',
        meaning: '상품 특성과 창고 상황에 맞춰 상온, 냉장, 냉동, 대형 Zone 중 보관 위치를 잡습니다.',
        watch: 'Zone 대기나 온도대 불일치는 이후 재고 반영 지연으로 이어질 수 있습니다.',
        next: '배정된 Zone이 업무적으로 납득되는지 보고, 재고 반영 단계로 넘어가는지 확인합니다.',
    },
    INBOUND_STORED: {
        title: '재고 반영',
        summary: '입고 수량을 재고 현황에 반영하는 상태입니다.',
        meaning: '실제 보관 위치가 확정된 입고 수량을 출고 가능 재고 맥락에 연결합니다.',
        watch: '반영이 늦으면 출고 할당에서 재고가 부족해 보이는 상황이 생길 수 있습니다.',
        next: '재고 반영 완료 이벤트가 남고 입고 흐름이 닫히는지 확인합니다.',
    },
    INBOUND_COMPLETED: {
        title: '입고 완료',
        summary: '입고 보조 흐름이 정상 종료된 상태입니다.',
        meaning: '입고 등록부터 재고 반영까지 끝나 출고 흐름에 영향을 줄 수 있는 준비가 마무리됐습니다.',
        watch: '완료된 입고를 계속 메인 병목으로 읽으면 출고 상황 판단이 흐려질 수 있습니다.',
        next: '필요하면 전체 로그에서 연결 이벤트만 확인하고, 메인 출고 흐름으로 시선을 돌립니다.',
    },
    WMS_RECEIVED: {
        title: '창고 작업 접수',
        summary: 'WMS가 출고 요청을 받아 창고 작업을 시작한 상태입니다.',
        meaning: 'OMS에서 넘어온 주문이 출고 작업으로 생성되어 WMS 7단 흐름에 올라왔습니다.',
        watch: '같은 요청이 중복 접수되면 이후 할당과 피킹이 중복 실행될 수 있습니다.',
        next: '작업 카드가 하나만 생성됐는지 보고 재고 할당 단계로 이동하는지 확인합니다.',
    },
    WMS_ALLOCATED: {
        title: '재고 할당',
        summary: '주문에 필요한 재고를 확보하는 상태입니다.',
        meaning: '출고에 필요한 수량을 실제 재고에서 잡아두는 창고 실행의 핵심 병목 구간입니다.',
        watch: '재고 부족, 동시 요청, Zone 불일치가 있으면 여기서 실패하거나 대기합니다.',
        next: '할당 실패 라벨이 있는지 보고, 정상이라면 피킹 지시가 생성되는지 확인합니다.',
    },
    WMS_PICKING: {
        title: '피킹 진행',
        summary: '작업자가 상품을 찾아 꺼내는 상태입니다.',
        meaning: '할당된 재고를 실제 창고 위치에서 찾아 출고 준비 위치로 옮기는 구간입니다.',
        watch: '품절 발견이나 위치 불일치가 있으면 피킹 실패로 바뀔 수 있습니다.',
        next: '작업자와 Zone 정보가 자연스러운지 보고 패킹 단계로 넘어가는지 봅니다.',
    },
    WMS_PACKED: {
        title: '패킹 완료',
        summary: '상품 포장이 끝나 출하 준비가 된 상태입니다.',
        meaning: '피킹된 상품에 박스 번호와 무게 정보를 붙여 운송으로 넘길 수 있게 정리합니다.',
        watch: '박스 정보가 없으면 이후 출하와 운송 추적에서 식별이 어려워집니다.',
        next: '박스 번호가 표시되는지 확인하고 출하 요청으로 이어지는지 봅니다.',
    },
    WMS_DISPATCHED: {
        title: '출하 완료',
        summary: 'WMS가 상품을 TMS 운송 흐름으로 넘긴 상태입니다.',
        meaning: '창고 내부 작업이 끝나고 배차와 운송을 담당하는 TMS로 책임이 이동합니다.',
        watch: 'TMS 요청이 실패하면 창고 작업은 끝났지만 운송이 시작되지 않은 상태가 됩니다.',
        next: '배차 요청 이벤트가 생기고 TMS 카드가 이어지는지 확인합니다.',
    },
    WMS_DELIVERING: {
        title: '운송 연동 대기',
        summary: 'WMS 관점에서 TMS 운송 결과를 기다리는 상태입니다.',
        meaning: '상품은 창고를 떠났고, WMS는 운송 진행과 인도 완료 신호를 받아 최종 종료합니다.',
        watch: '이 단계가 길어지면 창고 문제가 아니라 운송 지연으로 읽어야 합니다.',
        next: 'TMS 운송 이벤트와 인도 완료 이벤트가 이어지는지 확인합니다.',
    },
    WMS_COMPLETED: {
        title: 'WMS 출고 종료',
        summary: '창고 관점의 출고 처리가 끝난 상태입니다.',
        meaning: 'WMS가 필요한 출고 처리를 모두 마치고 이력과 목록 조회 대상으로 넘깁니다.',
        watch: '완료 후에도 카드가 오래 남으면 진행 중 작업과 섞여 병목처럼 보일 수 있습니다.',
        next: '전체 로그나 목록 탭에서 필요할 때만 다시 확인합니다.',
    },
    TMS_REQUESTED: {
        title: '배차 요청 접수',
        summary: '운송을 시작하기 위해 차량 배정을 요청한 상태입니다.',
        meaning: 'WMS 출하가 끝난 뒤 TMS가 운송 업무를 받을 준비를 시작합니다.',
        watch: '요청이 쌓이면 차량 배정 전 병목이 생긴 것으로 볼 수 있습니다.',
        next: '차량 배정 이벤트가 이어지는지 보고, 실패하면 배차 조치 후보를 확인합니다.',
    },
    TMS_VEHICLE_ASSIGNED: {
        title: '차량 배정',
        summary: '운송에 사용할 차량이 정해진 상태입니다.',
        meaning: '배송을 맡을 차량과 운송 단위가 연결되어 상차 준비가 가능해졌습니다.',
        watch: '차량 정보가 없거나 배정이 지연되면 운송 시작 전 대기 상태로 읽습니다.',
        next: '차량 ID가 표시되는지 보고 상차 단계로 이동하는지 확인합니다.',
    },
    TMS_LOADED: {
        title: '상차 완료',
        summary: '상품이 차량에 실려 운송을 시작할 준비가 된 상태입니다.',
        meaning: '창고 출하물과 배정 차량이 실제로 연결되어 이동 직전 단계에 도달했습니다.',
        watch: '상차 후 운송 이벤트가 늦으면 출발 대기 또는 운송 연동 지연으로 봅니다.',
        next: '운송 진행 이벤트와 위치 업데이트가 이어지는지 확인합니다.',
    },
    TMS_DELIVERING: {
        title: '운송 진행',
        summary: '상품이 목적지로 이동 중인 상태입니다.',
        meaning: '차량이 이동 중이며 Track & Trace 이벤트로 흐름을 따라볼 수 있습니다.',
        watch: '운송 단계는 오래 머물 수 있으므로 실패와 단순 체류를 구분해야 합니다.',
        next: '최근 이벤트 시각과 인도 완료 직전 여부를 함께 확인합니다.',
    },
    TMS_DELIVERED: {
        title: '인도 완료',
        summary: '고객 또는 목적지에 상품 인도가 끝난 상태입니다.',
        meaning: 'TMS 운송이 종료되고 전체 주문 흐름도 완료 상태로 닫힙니다.',
        watch: '인도 실패나 수취 거부가 있었다면 반품 흐름으로 분기될 수 있습니다.',
        next: '완료 이력과 전체 로그에서 주문 흐름이 정상 종료됐는지 확인합니다.',
    },
};

export const STAGE_DOMAIN: Record<TaskStage, 'OMS' | 'WMS' | 'TMS'> = {
    OMS_RECEIVED:         'OMS',
    OMS_VALIDATED:        'OMS',
    OMS_WMS_REQUESTED:    'OMS',
    INBOUND_RECEIVED:     'WMS',
    INBOUND_VALIDATED:    'WMS',
    INBOUND_ZONE_ASSIGNED:'WMS',
    INBOUND_STORED:       'WMS',
    INBOUND_COMPLETED:    'WMS',
    WMS_RECEIVED:         'WMS',
    WMS_ALLOCATED:        'WMS',
    WMS_PICKING:          'WMS',
    WMS_PACKED:           'WMS',
    WMS_DISPATCHED:       'WMS',
    WMS_DELIVERING:       'WMS',
    WMS_COMPLETED:        'WMS',
    TMS_REQUESTED:        'TMS',
    TMS_VEHICLE_ASSIGNED: 'TMS',
    TMS_LOADED:           'TMS',
    TMS_DELIVERING:       'TMS',
    TMS_DELIVERED:        'TMS',
};

// Routing Key 맵 — {aggregate}.{verb}.{past-tense}
export const STAGE_ROUTING_KEY: Record<TaskStage, string> = {
    OMS_RECEIVED:         'order.received',
    OMS_VALIDATED:        'order.validated',
    OMS_WMS_REQUESTED:    'order.wms.requested',
    INBOUND_RECEIVED:     'inbound.received',
    INBOUND_VALIDATED:    'inbound.validated',
    INBOUND_ZONE_ASSIGNED:'inbound.zone.assigned',
    INBOUND_STORED:       'inbound.stored',
    INBOUND_COMPLETED:    'inbound.completed',
    WMS_RECEIVED:         'shipment.received',
    WMS_ALLOCATED:        'shipment.allocated',
    WMS_PICKING:          'shipment.picking.started',
    WMS_PACKED:           'shipment.packed',
    WMS_DISPATCHED:       'shipment.dispatched',
    WMS_DELIVERING:       'shipment.delivering',
    WMS_COMPLETED:        'shipment.completed',
    TMS_REQUESTED:        'dispatch.requested',
    TMS_VEHICLE_ASSIGNED: 'dispatch.vehicleAssigned',
    TMS_LOADED:           'dispatch.loaded',
    TMS_DELIVERING:       'dispatch.delivering',
    TMS_DELIVERED:        'dispatch.delivered',
};

const WMS_STAGE_WORK_NODE_COUNTS: Partial<Record<TaskStage, number>> = {
    WMS_RECEIVED: 3,
    WMS_ALLOCATED: 4,
    WMS_PICKING: 4,
    WMS_PACKED: 4,
    WMS_DISPATCHED: 3,
    WMS_DELIVERING: 3,
    WMS_COMPLETED: 3,
};

export function getStageTicks(stage?: TaskStage): number {
    return LOGISTICS_STAGE_TICKS * (stage ? (WMS_STAGE_WORK_NODE_COUNTS[stage] ?? 1) : 1);
}

export function randomTicks(): number {
    return LOGISTICS_STAGE_TICKS;
}

export function getPipelineStagesForTask(task: Pick<LogisticsTask, 'type'>): TaskStage[] {
    return task.type === 'INBOUND' ? INBOUND_STAGES : PIPELINE_STAGES;
}

export function getFinalStageForTask(task: Pick<LogisticsTask, 'type'>): TaskStage {
    return task.type === 'INBOUND' ? INBOUND_FINAL_STAGE : FINAL_STAGE;
}
