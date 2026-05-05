import type { LogisticsTask, OmsReceiveNodeKey, TmsWorkNodeKey, WmsWorkNodeKey, TaskStage } from './events';

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
    | 'replay_event'
    | 'emergency_dispatch';

export interface FailureAction {
    id: FailureActionId;
    label: string;
    nextStage?: TaskStage;
    nextReceiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey;
}

export interface FailureDefinition {
    code: string;
    label: string;
    domain: 'OMS' | 'WMS' | 'TMS' | 'stream';
    type: FailureType;
    stage: TaskStage;
    receiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey;
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
        {
            code: 'OMS_SLA_POLICY_UNKNOWN',
            label: 'SLA 등급 미분류',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_RECEIVED',
            receiveNodeKey: 'sla-classify',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '화주 계약 SLA 정책을 조회할 수 없어 우선순위를 부여하지 못했습니다.',
            actions: [
                { id: 'retry_validation', label: 'SLA 재분류', nextStage: 'OMS_RECEIVED', nextReceiveNodeKey: 'sla-classify' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
    ],
    OMS_VALIDATED: [
        {
            code: 'OMS_CONTRACT_MISMATCH',
            label: '계약 조건 불일치',
            domain: 'OMS',
            type: 'business',
            stage: 'OMS_VALIDATED',
            receiveNodeKey: 'contract-rule',
            recoverable: false,
            resumePolicy: 'manual_review',
            summary: '화주 계약과 주문 채널 허용 범위가 맞지 않습니다.',
            actions: [
                { id: 'notify_customer', label: '화주 확인 요청' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
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
        {
            code: 'OMS_DESTINATION_OUT_OF_ZONE',
            label: '배송 불가 권역',
            domain: 'OMS',
            type: 'business',
            stage: 'OMS_VALIDATED',
            receiveNodeKey: 'destination-rule',
            recoverable: false,
            resumePolicy: 'manual_review',
            summary: '주문 배송지가 서비스 가능 권역을 벗어났습니다.',
            actions: [
                { id: 'confirm_address', label: '배송지 재확인' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_PAYMENT_UNCONFIRMED',
            label: '결제 미확인',
            domain: 'OMS',
            type: 'external',
            stage: 'OMS_VALIDATED',
            receiveNodeKey: 'payment-check',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '주문에 연결된 결제 상태가 확인되지 않았습니다.',
            actions: [
                { id: 'retry_validation', label: '결제 상태 재조회', nextStage: 'OMS_VALIDATED', nextReceiveNodeKey: 'payment-check' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_AUDIT_LOG_FAILED',
            label: '검증 감사 기록 실패',
            domain: 'OMS',
            type: 'system',
            stage: 'OMS_VALIDATED',
            receiveNodeKey: 'audit-ready',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '검증 결과를 감사 로그에 저장하지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '감사 로그 재저장', nextStage: 'OMS_VALIDATED', nextReceiveNodeKey: 'audit-ready' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
    ],
    OMS_WMS_REQUESTED: [
        {
            code: 'OMS_SHIPMENT_BUILD_FAILED',
            label: '출고 요청 구성 실패',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_WMS_REQUESTED',
            receiveNodeKey: 'shipment-build',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '검증된 주문을 WMS 출고 요청 payload로 구성하지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '출고 요청 재구성', nextStage: 'OMS_WMS_REQUESTED', nextReceiveNodeKey: 'shipment-build' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_INVENTORY_HINT_MISSING',
            label: '재고 힌트 누락',
            domain: 'OMS',
            type: 'data',
            stage: 'OMS_WMS_REQUESTED',
            receiveNodeKey: 'inventory-hint',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '후속 WMS 할당에 필요한 품목·수량 힌트를 첨부하지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '재고 힌트 재첨부', nextStage: 'OMS_WMS_REQUESTED', nextReceiveNodeKey: 'inventory-hint' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'OMS_EVENT_ENVELOPE_FAILED',
            label: '이벤트 봉투 생성 실패',
            domain: 'OMS',
            type: 'system',
            stage: 'OMS_WMS_REQUESTED',
            receiveNodeKey: 'event-envelope',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'routingKey, trace, idempotency 정보를 묶지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '이벤트 봉투 재생성', nextStage: 'OMS_WMS_REQUESTED', nextReceiveNodeKey: 'event-envelope' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
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
        {
            code: 'OMS_HANDOFF_UNCONFIRMED',
            label: 'WMS 승계 미확인',
            domain: 'OMS',
            type: 'external',
            stage: 'OMS_WMS_REQUESTED',
            receiveNodeKey: 'handoff-watch',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'WMS 접수 카드 생성 여부를 확인하지 못했습니다.',
            actions: [
                { id: 'replay_event', label: 'WMS 재전송 후 대기', nextStage: 'OMS_WMS_REQUESTED', nextReceiveNodeKey: 'broker-send' },
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
            receiveNodeKey: 'request-ingest',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'WMS 수신 데이터와 OMS 전달 데이터가 맞지 않습니다.',
            actions: [
                { id: 'replay_event', label: 'WMS 접수 재전송', nextStage: 'WMS_RECEIVED', nextReceiveNodeKey: 'request-ingest' },
                { id: 'retry_validation', label: 'OMS 재검증 요청', nextStage: 'OMS_VALIDATED' },
            ],
        },
        {
            code: 'WMS_DUPLICATE_REQUEST',
            label: '중복 출고 요청',
            domain: 'WMS',
            type: 'data',
            stage: 'WMS_RECEIVED',
            receiveNodeKey: 'duplicate-check',
            recoverable: false,
            resumePolicy: 'manual_review',
            summary: '동일한 출고 요청이 이미 처리된 이력이 있습니다.',
            actions: [
                { id: 'cancel_order', label: '중복 요청 취소' },
                { id: 'retry_validation', label: 'OMS 재확인 후 재접수', nextStage: 'WMS_RECEIVED', nextReceiveNodeKey: 'request-ingest' },
            ],
        },
        {
            code: 'WMS_WORK_KEY_CONFLICT',
            label: '작업번호 충돌',
            domain: 'WMS',
            type: 'system',
            stage: 'WMS_RECEIVED',
            receiveNodeKey: 'work-key',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '출고 작업번호 발급 중 중복 충돌이 발생했습니다.',
            actions: [
                { id: 'replay_event', label: '작업번호 재발급', nextStage: 'WMS_RECEIVED', nextReceiveNodeKey: 'work-key' },
                { id: 'cancel_order', label: '주문 취소' },
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
            receiveNodeKey: 'stock-check',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '할당 가능한 재고가 부족하여 출고 할당에 실패했습니다.',
            actions: [
                { id: 'reallocate_stock', label: '대체 재고 재할당', nextStage: 'WMS_ALLOCATED', nextReceiveNodeKey: 'stock-check' },
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
            receiveNodeKey: 'rule-apply',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '현재 Zone 적재량이 한계를 넘어서 다른 위치로 재배치가 필요합니다.',
            actions: [
                { id: 'switch_zone', label: '다른 Zone으로 재배치', nextStage: 'WMS_ALLOCATED', nextReceiveNodeKey: 'rule-apply' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
        {
            code: 'WMS_STOCK_RESERVE_FAILED',
            label: '재고 예약 실패',
            domain: 'WMS',
            type: 'system',
            stage: 'WMS_ALLOCATED',
            receiveNodeKey: 'stock-reserve',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '선택된 재고에 예약 잠금을 걸지 못했습니다.',
            actions: [
                { id: 'reallocate_stock', label: '재고 예약 재시도', nextStage: 'WMS_ALLOCATED', nextReceiveNodeKey: 'stock-reserve' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'WMS_STOCK_SHORTAGE',
            label: '재고 결품',
            domain: 'WMS',
            type: 'business',
            stage: 'WMS_ALLOCATED',
            receiveNodeKey: 'shortage-check',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '예약 시도 중 재고 수량이 부족한 결품이 확인되었습니다.',
            actions: [
                { id: 'partial_ship', label: '부분 출고 전환', nextStage: 'WMS_PICKING' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
    ],
    WMS_PICKING: [
        {
            code: 'WMS_PICK_ORDER_FAILED',
            label: '피킹 지시 생성 실패',
            domain: 'WMS',
            type: 'system',
            stage: 'WMS_PICKING',
            receiveNodeKey: 'pick-order',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '피킹 지시서를 생성하지 못했습니다.',
            actions: [
                { id: 'retry_picking', label: '피킹 지시 재생성', nextStage: 'WMS_PICKING', nextReceiveNodeKey: 'pick-order' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'WMS_WORKER_UNAVAILABLE',
            label: '작업자 배정 불가',
            domain: 'WMS',
            type: 'capacity',
            stage: 'WMS_PICKING',
            receiveNodeKey: 'worker-assign',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '피킹을 담당할 작업자를 배정할 수 없습니다.',
            actions: [
                { id: 'retry_picking', label: '작업자 재배정', nextStage: 'WMS_PICKING', nextReceiveNodeKey: 'worker-assign' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
        {
            code: 'WMS_LOCATION_NOT_FOUND',
            label: '피킹 위치 미확인',
            domain: 'WMS',
            type: 'data',
            stage: 'WMS_PICKING',
            receiveNodeKey: 'location-move',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '지시된 선반 위치를 찾지 못했습니다.',
            actions: [
                { id: 'retry_picking', label: '위치 재탐색', nextStage: 'WMS_PICKING', nextReceiveNodeKey: 'location-move' },
                { id: 'reallocate_stock', label: '대체 로케이션 재할당', nextStage: 'WMS_ALLOCATED', nextReceiveNodeKey: 'stock-check' },
            ],
        },
        {
            code: 'WMS_PICKING_MISS',
            label: '피킹 미스',
            domain: 'WMS',
            type: 'business',
            stage: 'WMS_PICKING',
            receiveNodeKey: 'barcode-scan',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '지시된 로케이션에서 품목을 찾지 못했습니다.',
            actions: [
                { id: 'retry_picking', label: '피킹 재시도', nextStage: 'WMS_PICKING', nextReceiveNodeKey: 'barcode-scan' },
                { id: 'reallocate_stock', label: '대체 로케이션 재할당', nextStage: 'WMS_ALLOCATED', nextReceiveNodeKey: 'stock-check' },
            ],
        },
    ],
    WMS_PACKED: [
        {
            code: 'WMS_ITEM_DEFECT',
            label: '상품 검수 불량',
            domain: 'WMS',
            type: 'business',
            stage: 'WMS_PACKED',
            receiveNodeKey: 'item-check',
            recoverable: false,
            resumePolicy: 'manual_review',
            summary: '꺼내온 상품에 파손 또는 오염이 확인되었습니다.',
            actions: [
                { id: 'reallocate_stock', label: '대체 재고 재할당', nextStage: 'WMS_ALLOCATED', nextReceiveNodeKey: 'stock-check' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
        {
            code: 'WMS_PACKAGING_SHORTAGE',
            label: '포장 자재 부족',
            domain: 'WMS',
            type: 'capacity',
            stage: 'WMS_PACKED',
            receiveNodeKey: 'box-select',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '필요한 포장 자재가 부족하여 출고 포장을 완료할 수 없습니다.',
            actions: [
                { id: 'repack', label: '자재 보충 후 재포장', nextStage: 'WMS_PACKED', nextReceiveNodeKey: 'box-select' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
        {
            code: 'WMS_LABEL_PRINT_FAILED',
            label: '라벨 출력 실패',
            domain: 'WMS',
            type: 'system',
            stage: 'WMS_PACKED',
            receiveNodeKey: 'label-print',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '운송장 라벨을 출력하지 못했습니다.',
            actions: [
                { id: 'repack', label: '라벨 재출력', nextStage: 'WMS_PACKED', nextReceiveNodeKey: 'label-print' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
        {
            code: 'WMS_WEIGHT_MISMATCH',
            label: '중량 불일치',
            domain: 'WMS',
            type: 'data',
            stage: 'WMS_PACKED',
            receiveNodeKey: 'weight-check',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '측정 중량이 기준값과 달라 포장 내용을 재확인해야 합니다.',
            actions: [
                { id: 'repack', label: '포장 재검수', nextStage: 'WMS_PACKED', nextReceiveNodeKey: 'item-check' },
                { id: 'cancel_order', label: '주문 취소' },
            ],
        },
    ],
    WMS_DISPATCHED: [
        {
            code: 'WMS_DOCK_UNAVAILABLE',
            label: '도크 배정 불가',
            domain: 'WMS',
            type: 'capacity',
            stage: 'WMS_DISPATCHED',
            receiveNodeKey: 'dock-assign',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '사용 가능한 도크가 없어 출하 대기가 필요합니다.',
            actions: [
                { id: 'redispatch', label: '도크 재배정', nextStage: 'WMS_DISPATCHED', nextReceiveNodeKey: 'dock-assign' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
        {
            code: 'WMS_DISPATCH_DOC_MISSING',
            label: '출하 문서 누락',
            domain: 'WMS',
            type: 'data',
            stage: 'WMS_DISPATCHED',
            receiveNodeKey: 'dispatch-check',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '출하에 필요한 문서가 누락되어 출고를 마무리할 수 없습니다.',
            actions: [
                { id: 'redispatch', label: '문서 보완 후 재출하', nextStage: 'WMS_DISPATCHED', nextReceiveNodeKey: 'dispatch-check' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
        {
            code: 'WMS_TMS_REQUEST_FAILED',
            label: 'TMS 배차 요청 실패',
            domain: 'WMS',
            type: 'external',
            stage: 'WMS_DISPATCHED',
            receiveNodeKey: 'tms-request',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '운송 시스템에 배차 요청을 전달하지 못했습니다.',
            actions: [
                { id: 'redispatch', label: 'TMS 배차 재요청', nextStage: 'WMS_DISPATCHED', nextReceiveNodeKey: 'tms-request' },
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
            receiveNodeKey: 'tms-sync',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '창고에서 운송사로의 인계가 지연되고 있습니다.',
            actions: [
                { id: 'redispatch', label: '운송사 재인계', nextStage: 'WMS_DISPATCHED', nextReceiveNodeKey: 'tms-request' },
                { id: 'notify_customer', label: '지연 안내' },
            ],
        },
        {
            code: 'WMS_DELIVERY_DELAYED',
            label: '배송 지연 감지',
            domain: 'WMS',
            type: 'external',
            stage: 'WMS_DELIVERING',
            receiveNodeKey: 'delay-watch',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '예정 시간을 초과한 배송 지연이 감지되었습니다.',
            actions: [
                { id: 'notify_customer', label: '지연 안내' },
                { id: 'redispatch', label: '재배송 요청', nextStage: 'WMS_DELIVERING' },
            ],
        },
        {
            code: 'WMS_DELIVERY_RESULT_MISSING',
            label: '인도 결과 미수신',
            domain: 'WMS',
            type: 'external',
            stage: 'WMS_DELIVERING',
            receiveNodeKey: 'delivery-result',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '운송 시스템으로부터 인도 완료 신호를 받지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '인도 결과 재조회', nextStage: 'WMS_DELIVERING', nextReceiveNodeKey: 'tms-sync' },
                { id: 'notify_customer', label: '배송 상태 안내' },
            ],
        },
    ],
    WMS_COMPLETED: [],
    TMS_REQUESTED: [
        {
            code: 'TMS_DISPATCH_INGEST_FAILED',
            label: '배차 요청 접수 실패',
            domain: 'TMS',
            type: 'system',
            stage: 'TMS_REQUESTED',
            receiveNodeKey: 'dispatch-ingest',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'WMS 출하 완료 이벤트를 수신해 배차 요청 작업을 생성하지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '배차 요청 재접수', nextStage: 'TMS_REQUESTED', nextReceiveNodeKey: 'dispatch-ingest' },
                { id: 'notify_customer', label: '배송 지연 안내' },
            ],
        },
        {
            code: 'TMS_VEHICLE_UNAVAILABLE',
            label: '차량 미배차',
            domain: 'TMS',
            type: 'capacity',
            stage: 'TMS_REQUESTED',
            receiveNodeKey: 'vehicle-match',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '현재 가용 차량이 없어 배차에 실패했습니다.',
            actions: [
                { id: 'reassign_vehicle', label: '재배차 시도', nextStage: 'TMS_REQUESTED' },
                { id: 'notify_customer', label: '출고 지연 안내' },
            ],
        },
        {
            code: 'TMS_ROUTE_CALC_FAILED',
            label: '경로 계산 실패',
            domain: 'TMS',
            type: 'system',
            stage: 'TMS_REQUESTED',
            receiveNodeKey: 'route-calc',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '도착지까지의 경로를 산출할 수 없습니다.',
            actions: [
                { id: 'redispatch', label: '경로 재계산 요청', nextStage: 'TMS_REQUESTED' },
                { id: 'confirm_address', label: '도착지 확인' },
            ],
        },
        {
            code: 'TMS_DISPATCH_QUEUE_FAILED',
            label: '배차 대기 등록 실패',
            domain: 'TMS',
            type: 'system',
            stage: 'TMS_REQUESTED',
            receiveNodeKey: 'dispatch-queue',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '배차 대기 큐에 요청을 올리지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '배차 대기 재등록', nextStage: 'TMS_REQUESTED', nextReceiveNodeKey: 'dispatch-queue' },
                { id: 'notify_customer', label: '배송 지연 안내' },
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
            receiveNodeKey: 'vehicle-confirm',
            recoverable: true,
            resumePolicy: 'rollback_previous_stage',
            summary: '같은 차량 자원이 중복 배정되어 다시 배차해야 합니다.',
            actions: [
                { id: 'reassign_vehicle', label: '차량 재배정', nextStage: 'TMS_REQUESTED' },
                { id: 'notify_customer', label: '배차 지연 안내' },
            ],
        },
        {
            code: 'TMS_DRIVER_UNAVAILABLE',
            label: '기사 배정 불가',
            domain: 'TMS',
            type: 'capacity',
            stage: 'TMS_VEHICLE_ASSIGNED',
            receiveNodeKey: 'driver-assign',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '배정 가능한 기사가 없어 출발이 지연됩니다.',
            actions: [
                { id: 'reassign_vehicle', label: '기사 재배정', nextStage: 'TMS_VEHICLE_ASSIGNED' },
                { id: 'notify_customer', label: '배송 지연 안내' },
            ],
        },
        {
            code: 'TMS_DEPARTURE_NOTIFY_FAILED',
            label: '출발 준비 통보 실패',
            domain: 'TMS',
            type: 'external',
            stage: 'TMS_VEHICLE_ASSIGNED',
            receiveNodeKey: 'departure-notify',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '기사 또는 화주에게 출발 일정을 통보하지 못했습니다.',
            actions: [
                { id: 'replay_event', label: '출발 통보 재전송', nextStage: 'TMS_VEHICLE_ASSIGNED', nextReceiveNodeKey: 'departure-notify' },
                { id: 'notify_customer', label: '화주 직접 연락' },
            ],
        },
    ],
    TMS_LOADED: [
        {
            code: 'TMS_CARGO_SCAN_MISMATCH',
            label: '화물 스캔 불일치',
            domain: 'TMS',
            type: 'data',
            stage: 'TMS_LOADED',
            receiveNodeKey: 'cargo-scan',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '화물 스캔 결과가 출하 정보와 일치하지 않습니다.',
            actions: [
                { id: 'redispatch', label: '화물 재확인 후 재스캔', nextStage: 'TMS_LOADED' },
                { id: 'notify_customer', label: '출발 지연 안내' },
            ],
        },
        {
            code: 'TMS_LOADING_DELAY',
            label: '상차 지연',
            domain: 'TMS',
            type: 'external',
            stage: 'TMS_LOADED',
            receiveNodeKey: 'load-confirm',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '상차 대기열이 길어 운송 출발이 지연되고 있습니다.',
            actions: [
                { id: 'redispatch', label: '출발 재조정', nextStage: 'TMS_LOADED' },
                { id: 'notify_customer', label: '배송 지연 안내' },
            ],
        },
        {
            code: 'TMS_DEPARTURE_SIGNAL_MISSING',
            label: '출발 신호 미수신',
            domain: 'TMS',
            type: 'external',
            stage: 'TMS_LOADED',
            receiveNodeKey: 'departure-signal',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '상차 완료 후 출발 등록 신호를 받지 못했습니다.',
            actions: [
                { id: 'redispatch', label: '출발 신호 재등록', nextStage: 'TMS_LOADED', nextReceiveNodeKey: 'departure-signal' },
                { id: 'notify_customer', label: '배송 지연 안내' },
            ],
        },
    ],
    TMS_DELIVERING: [
        {
            code: 'TMS_ACCESS_RESTRICTED',
            label: '배송지 접근 제한',
            domain: 'TMS',
            type: 'external',
            stage: 'TMS_DELIVERING',
            receiveNodeKey: 'en-route',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '차량 진입 제한 등으로 배송지 접근이 불가능합니다.',
            actions: [
                { id: 'notify_customer', label: '대체 수령 안내' },
                { id: 'redispatch', label: '배송 경로 재조정', nextStage: 'TMS_DELIVERING' },
            ],
        },
        {
            code: 'TMS_CHECKPOINT_MISSED',
            label: '체크포인트 미통과',
            domain: 'TMS',
            type: 'external',
            stage: 'TMS_DELIVERING',
            receiveNodeKey: 'checkpoint',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '지정된 중간 경유 체크포인트를 제 시간에 통과하지 못했습니다.',
            actions: [
                { id: 'notify_customer', label: '배송 지연 안내' },
                { id: 'redispatch', label: '경로 재조정', nextStage: 'TMS_DELIVERING' },
            ],
        },
        {
            code: 'TMS_CUSTOMER_ABSENT',
            label: '수취인 부재',
            domain: 'TMS',
            type: 'business',
            stage: 'TMS_DELIVERING',
            receiveNodeKey: 'arrival-estimate',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '배송지 도착 시 수취인이 없어 인도에 실패했습니다.',
            actions: [
                { id: 'notify_customer', label: '재방문 안내' },
                { id: 'redispatch', label: '재배송 요청', nextStage: 'TMS_DELIVERING' },
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

export function pickFailureForReceiveNode(stage: TaskStage, receiveNodeKey?: string): FailureDefinition | null {
    const candidates = getFailureCandidatesForStage(stage, receiveNodeKey);
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export function hasFailureCandidates(stage: TaskStage): boolean {
    return (FAILURE_CATALOG[stage] ?? []).length > 0;
}

export function getFailureCandidatesForStage(stage: TaskStage, receiveNodeKey?: string): FailureDefinition[] {
    const candidates = FAILURE_CATALOG[stage] ?? [];
    const isWorkNodeStage = stage.startsWith('OMS_') || stage.startsWith('TMS_') || stage.startsWith('WMS_');
    if (!isWorkNodeStage || !receiveNodeKey) return candidates;
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
