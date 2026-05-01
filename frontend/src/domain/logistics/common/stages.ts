import type { LogisticsTask, TaskStage, OmsStage, InboundStage, WmsOutStage, TmsStage } from './events';

export const OMS_STAGES: OmsStage[] = [
    'OMS_RECEIVED',
    'OMS_VALIDATED',
    'OMS_WMS_REQUESTED',
];

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

// 1틱 = 100ms. 단계당 평균 50틱 = 5초 (T3-ARCH 흐름 6)
const AVG_TICKS = 50;

export function randomTicks(): number {
    return Math.floor(AVG_TICKS * (0.8 + Math.random() * 0.4));
}

export function getPipelineStagesForTask(task: Pick<LogisticsTask, 'type'>): TaskStage[] {
    return task.type === 'INBOUND' ? INBOUND_STAGES : PIPELINE_STAGES;
}

export function getFinalStageForTask(task: Pick<LogisticsTask, 'type'>): TaskStage {
    return task.type === 'INBOUND' ? INBOUND_FINAL_STAGE : FINAL_STAGE;
}
