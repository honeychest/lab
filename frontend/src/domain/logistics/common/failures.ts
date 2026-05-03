import type { LogisticsTask, OmsReceiveNodeKey, TaskStage } from './events';

export type FailureType = 'business' | 'system' | 'external' | 'capacity' | 'data';
export type ResumePolicy = 'retry_current_stage' | 'rollback_previous_stage' | 'manual_review' | 'cancel_only';
export type FailureActionId =
    | 'retry_validation'
    | 'reallocate_stock'
    | 'switch_zone'
    | 'retry_picking'
    | 'repack'
    | 'redispatch'
    | 'reassign_vehicle'
    | 'confirm_address'
    | 'partial_ship'
    | 'notify_customer'
    | 'cancel_order'
    | 'replay_event';

export interface FailureAction {
    id: FailureActionId;
    label: string;
    nextStage?: TaskStage;
    nextReceiveNodeKey?: OmsReceiveNodeKey;
}

export interface FailureDefinition {
    code: string;
    label: string;
    domain: 'OMS' | 'WMS' | 'TMS' | 'stream';
    type: FailureType;
    stage: TaskStage;
    receiveNodeKey?: OmsReceiveNodeKey;
    recoverable: boolean;
    resumePolicy: ResumePolicy;
    summary: string;
    actions: FailureAction[];
}

const FAILURE_CATALOG: Record<TaskStage, FailureDefinition[]> = {
    OMS_RECEIVED: [
        {
            code: 'OMS_RAW_PAYLOAD_MISSING',
            label: '주문 원문 누락',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_RECEIVED',
            receiveNodeKey: 'raw-ingest',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '채널 payload가 비어 있거나 원문 식별자가 없어 접수할 수 없습니다.',
            actions: [
                { id: 'replay_event', label: '원문 재수신', nextStage: 'OMS_RECEIVED', nextReceiveNodeKey: 'raw-ingest' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_OWNER_UNMATCHED',
            label: '화주 식별 실패',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_RECEIVED',
            receiveNodeKey: 'owner-match',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '유입 채널과 화주 계약 정보를 연결하지 못했습니다.',
            actions: [
                { id: 'retry_validation', label: '화주 매핑 후 재시도', nextStage: 'OMS_RECEIVED', nextReceiveNodeKey: 'owner-match' },
                { id: 'notify_customer', label: '화주 확인 요청' },
            ],
        },
        {
            code: 'OMS_REQUIRED_FIELD_MISSING',
            label: '필수값 누락',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_RECEIVED',
            receiveNodeKey: 'required-fields',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '품목, 수량, 도착지, 외부 주문키 중 하나가 누락되었습니다.',
            actions: [
                { id: 'retry_validation', label: '필수값 보정 후 재검사', nextStage: 'OMS_RECEIVED', nextReceiveNodeKey: 'required-fields' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_DUPLICATE_ORDER',
            label: '중복 주문 감지',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_RECEIVED',
            receiveNodeKey: 'duplicate-check',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '같은 주문이 중복 유입되어 접수 단계에서 차단되었습니다.',
            actions: [
                { id: 'retry_validation', label: '중복 확인 후 재접수', nextStage: 'OMS_RECEIVED', nextReceiveNodeKey: 'duplicate-check' },
                { id: 'cancel_order', label: '중복 주문 취소' },
            ],
        },
        {
            code: 'OMS_RECEIPT_KEY_CONFLICT',
            label: '접수키 충돌',
            domain: 'OMS',
            type: 'system',
            stage: 'OMS_RECEIVED',
            receiveNodeKey: 'receipt-key',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'taskId 또는 traceId 발급 중 충돌이 발생했습니다.',
            actions: [
                { id: 'retry_validation', label: '접수키 재발급', nextStage: 'OMS_RECEIVED', nextReceiveNodeKey: 'receipt-key' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_VALIDATION_QUEUE_FAILED',
            label: '검증 큐 등록 실패',
            domain: 'OMS',
            type: 'system',
            stage: 'OMS_RECEIVED',
            receiveNodeKey: 'next-queue',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '검증 레인으로 넘길 이벤트를 큐에 적재하지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '검증 큐 재등록', nextStage: 'OMS_RECEIVED', nextReceiveNodeKey: 'next-queue' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
    ],
    OMS_VALIDATED: [
        {
            code: 'OMS_RESTRICTED_ITEM',
            label: '취급 제한 상품',
            domain: 'OMS',
            type: 'business',
            stage: 'OMS_VALIDATED',
            receiveNodeKey: 'item-rule',
            recoverable: false,
            resumePolicy: 'manual_review',
            summary: '해당 상품은 현재 출고 정책상 처리할 수 없습니다.',
            actions: [
                { id: 'notify_customer', label: '고객 안내' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_ORDER_SCHEMA_MISMATCH',
            label: '주문 데이터 불일치',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_VALIDATED',
            receiveNodeKey: 'quantity-rule',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '주문 필수값과 품목 마스터 정보가 일치하지 않습니다.',
            actions: [
                { id: 'retry_validation', label: '데이터 수정 후 재검증', nextStage: 'OMS_VALIDATED', nextReceiveNodeKey: 'quantity-rule' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
    ],
    OMS_WMS_REQUESTED: [
        {
            code: 'OMS_WMS_TIMEOUT',
            label: 'WMS 요청 타임아웃',
            domain: 'OMS',
            type: 'external',
            stage: 'OMS_WMS_REQUESTED',
            receiveNodeKey: 'broker-send',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'OMS에서 WMS로 넘기는 요청이 제한 시간 안에 응답하지 않았습니다.',
            actions: [
                { id: 'replay_event', label: 'WMS 요청 재전송', nextStage: 'OMS_WMS_REQUESTED', nextReceiveNodeKey: 'broker-send' },
                { id: 'notify_customer', label: '지연 안내' },
            ],
        },
    ],
    INBOUND_RECEIVED: [
        {
            code: 'INBOUND_OWNER_DISABLED',
            label: '입고 화주 비활성',
            domain: 'WMS',
            type: 'business',
            stage: 'INBOUND_RECEIVED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '입고 요청을 보낸 화주 상태가 비활성이어서 등록 단계에서 보류되었습니다.',
            actions: [
                { id: 'retry_validation', label: '화주 확인 후 재등록', nextStage: 'INBOUND_RECEIVED' },
                { id: 'cancel_order', label: '입고 요청 반려' },
            ],
        },
    ],
    INBOUND_VALIDATED: [
        {
            code: 'INBOUND_ITEM_SCHEMA_MISMATCH',
            label: '입고 품목 정보 불일치',
            domain: 'WMS',
            type: 'data',
            stage: 'INBOUND_VALIDATED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '입고 요청의 품목 마스터 정보가 현재 기준과 맞지 않습니다.',
            actions: [
                { id: 'retry_validation', label: '정보 수정 후 재검증', nextStage: 'INBOUND_VALIDATED' },
                { id: 'cancel_order', label: '입고 요청 반려' },
            ],
        },
    ],
    INBOUND_ZONE_ASSIGNED: [
        {
            code: 'INBOUND_ZONE_CAPACITY_SHORTAGE',
            label: '입고 Zone 여유 부족',
            domain: 'WMS',
            type: 'capacity',
            stage: 'INBOUND_ZONE_ASSIGNED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '선택 가능한 Zone에 여유가 부족해 재배치가 필요합니다.',
            actions: [
                { id: 'switch_zone', label: '다른 Zone 재배정', nextStage: 'INBOUND_ZONE_ASSIGNED' },
                { id: 'notify_customer', label: '입고 지연 안내' },
            ],
        },
    ],
    INBOUND_STORED: [
        {
            code: 'INBOUND_STOCK_APPLY_DELAY',
            label: '재고 반영 지연',
            domain: 'WMS',
            type: 'system',
            stage: 'INBOUND_STORED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '입고 재고 수량 반영이 지연되고 있습니다.',
            actions: [
                { id: 'replay_event', label: '재고 반영 재시도', nextStage: 'INBOUND_STORED' },
                { id: 'notify_customer', label: '반영 지연 안내' },
            ],
        },
    ],
    INBOUND_COMPLETED: [],
    WMS_RECEIVED: [
        {
            code: 'WMS_RECEIPT_MISMATCH',
            label: '입고 데이터 불일치',
            domain: 'WMS',
            type: 'data',
            stage: 'WMS_RECEIVED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'WMS 수신 데이터와 OMS 전달 데이터가 맞지 않습니다.',
            actions: [
                { id: 'replay_event', label: 'WMS 접수 재전송', nextStage: 'WMS_RECEIVED' },
                { id: 'retry_validation', label: 'OMS 재검증 요청', nextStage: 'OMS_VALIDATED' },
            ],
        },
    ],
    WMS_ALLOCATED: [
        {
            code: 'WMS_OUT_OF_STOCK',
            label: '재고 부족',
            domain: 'WMS',
            type: 'business',
            stage: 'WMS_ALLOCATED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '할당 가능한 재고가 부족하여 출고 할당에 실패했습니다.',
            actions: [
                { id: 'reallocate_stock', label: '대체 재고 재할당', nextStage: 'WMS_ALLOCATED' },
                { id: 'partial_ship', label: '부분 출고 전환', nextStage: 'WMS_PICKING' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'WMS_ZONE_CAPACITY_EXCEEDED',
            label: 'Zone 용량 초과',
            domain: 'WMS',
            type: 'capacity',
            stage: 'WMS_ALLOCATED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '현재 Zone 적재량이 한계를 넘어서 다른 위치로 재배치가 필요합니다.',
            actions: [
                { id: 'switch_zone', label: '다른 Zone으로 재배치', nextStage: 'WMS_ALLOCATED' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
    ],
    WMS_PICKING: [
        {
            code: 'WMS_PICKING_MISS',
            label: '피킹 미스',
            domain: 'WMS',
            type: 'business',
            stage: 'WMS_PICKING',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '지시된 로케이션에서 품목을 찾지 못했습니다.',
            actions: [
                { id: 'retry_picking', label: '피킹 재시도', nextStage: 'WMS_PICKING' },
                { id: 'reallocate_stock', label: '대체 로케이션 재할당', nextStage: 'WMS_ALLOCATED' },
            ],
        },
    ],
    WMS_PACKED: [
        {
            code: 'WMS_PACKAGING_SHORTAGE',
            label: '포장 자재 부족',
            domain: 'WMS',
            type: 'capacity',
            stage: 'WMS_PACKED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '필요한 포장 자재가 부족하여 출고 포장을 완료할 수 없습니다.',
            actions: [
                { id: 'repack', label: '자재 보충 후 재포장', nextStage: 'WMS_PACKED' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
    ],
    WMS_DISPATCHED: [
        {
            code: 'WMS_DISPATCH_DOC_MISSING',
            label: '출하 문서 누락',
            domain: 'WMS',
            type: 'data',
            stage: 'WMS_DISPATCHED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '출하에 필요한 문서가 누락되어 출고를 마무리할 수 없습니다.',
            actions: [
                { id: 'redispatch', label: '문서 보완 후 재출하', nextStage: 'WMS_DISPATCHED' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
    ],
    WMS_DELIVERING: [
        {
            code: 'WMS_HANDOFF_DELAY',
            label: '운송 인계 지연',
            domain: 'WMS',
            type: 'external',
            stage: 'WMS_DELIVERING',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '창고에서 운송사로의 인계가 지연되고 있습니다.',
            actions: [
                { id: 'redispatch', label: '운송사 재인계', nextStage: 'WMS_DISPATCHED' },
                { id: 'notify_customer', label: '지연 안내' },
            ],
        },
    ],
    WMS_COMPLETED: [],
    TMS_REQUESTED: [
        {
            code: 'TMS_VEHICLE_UNAVAILABLE',
            label: '차량 미배차',
            domain: 'TMS',
            type: 'capacity',
            stage: 'TMS_REQUESTED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '현재 가용 차량이 없어 배차에 실패했습니다.',
            actions: [
                { id: 'reassign_vehicle', label: '재배차 시도', nextStage: 'TMS_REQUESTED' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
    ],
    TMS_VEHICLE_ASSIGNED: [
        {
            code: 'TMS_ASSIGNMENT_CONFLICT',
            label: '배차 경합',
            domain: 'TMS',
            type: 'system',
            stage: 'TMS_VEHICLE_ASSIGNED',
            recoverable: true,
            resumePolicy: 'rollback_previous_stage',
            summary: '같은 차량 자원이 중복 배정되어 다시 배차해야 합니다.',
            actions: [
                { id: 'reassign_vehicle', label: '차량 재배정', nextStage: 'TMS_REQUESTED' },
                { id: 'notify_customer', label: '배차 지연 안내' },
            ],
        },
    ],
    TMS_LOADED: [
        {
            code: 'TMS_LOADING_DELAY',
            label: '상차 지연',
            domain: 'TMS',
            type: 'external',
            stage: 'TMS_LOADED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '상차 대기열이 길어 운송 출발이 지연되고 있습니다.',
            actions: [
                { id: 'redispatch', label: '출발 재조정', nextStage: 'TMS_LOADED' },
                { id: 'notify_customer', label: '배송 지연 안내' },
            ],
        },
    ],
    TMS_DELIVERING: [
        {
            code: 'TMS_CUSTOMER_ABSENT',
            label: '수취인 부재',
            domain: 'TMS',
            type: 'business',
            stage: 'TMS_DELIVERING',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '배송지 도착 시 수취인이 없어 인도에 실패했습니다.',
            actions: [
                { id: 'notify_customer', label: '재방문 안내' },
                { id: 'redispatch', label: '재배송 요청', nextStage: 'TMS_DELIVERING' },
            ],
        },
        {
            code: 'TMS_ACCESS_RESTRICTED',
            label: '배송지 접근 제한',
            domain: 'TMS',
            type: 'external',
            stage: 'TMS_DELIVERING',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '차량 진입 제한 등으로 배송지 접근이 불가능합니다.',
            actions: [
                { id: 'notify_customer', label: '대체 수령 안내' },
                { id: 'redispatch', label: '배송 경로 재조정', nextStage: 'TMS_DELIVERING' },
            ],
        },
    ],
    TMS_DELIVERED: [],
};

export function pickFailureForStage(stage: TaskStage): FailureDefinition | null {
    const candidates = FAILURE_CATALOG[stage] ?? [];
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export function pickFailureForReceiveNode(stage: TaskStage, receiveNodeKey?: OmsReceiveNodeKey): FailureDefinition | null {
    const candidates = getFailureCandidatesForStage(stage, receiveNodeKey);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export function hasFailureCandidates(stage: TaskStage): boolean {
    return (FAILURE_CATALOG[stage] ?? []).length > 0;
}

export function getFailureCandidatesForStage(stage: TaskStage, receiveNodeKey?: OmsReceiveNodeKey): FailureDefinition[] {
    const candidates = FAILURE_CATALOG[stage] ?? [];
    if (!stage.startsWith('OMS_') || !receiveNodeKey) return candidates;
    return candidates.filter(item => item.receiveNodeKey === receiveNodeKey);
}

export function getFailureDefinitionByCode(code?: string): FailureDefinition | null {
    if (!code) return null;
    for (const stage of Object.keys(FAILURE_CATALOG) as TaskStage[]) {
        const match = FAILURE_CATALOG[stage].find(item => item.code === code);
        if (match) return match;
    }
    return null;
}
