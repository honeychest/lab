import type { LogisticsTask, OmsReceiveNodeKey, QmsWorkNodeKey, TmsWorkNodeKey, WmsWorkNodeKey, EosWorkNodeKey, InboundWorkNodeKey, AftWorkNodeKey, TaskStage } from './events';

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
    | 'emergency_dispatch'
    | 'refresh_batch'
    | 'assign_default_policy'
    | 'override_inspection_type'
    | 'reallocate_inspector'
    | 'resample'
    | 'recalibrate_tool'
    | 'quarantine_batch'
    | 'reinspect'
    | 'force_pass'
    | 'reprint_label'
    | 'escalate_judgment'
    | 'return_to_supplier'
    | 'dispose'
    | 'retry_confirm'
    | 'retry_handoff'
    | 'skip_handoff';

export interface FailureAction {
    id: FailureActionId;
    label: string;
    nextStage?: TaskStage;
    nextReceiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey | QmsWorkNodeKey | EosWorkNodeKey | InboundWorkNodeKey | AftWorkNodeKey;
}

export interface FailureDefinition {
    code: string;
    label: string;
    domain: 'OMS' | 'WMS' | 'QMS' | 'TMS' | 'EOS' | 'INBOUND' | 'AFT' | 'stream';
    type: FailureType;
    stage: TaskStage;
    receiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey | QmsWorkNodeKey | EosWorkNodeKey | InboundWorkNodeKey | AftWorkNodeKey;
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
    INBOUND_QC: [
        {
            code: 'INBOUND_QC_VISUAL_FAIL',
            label: '외관 불량',
            domain: 'INBOUND',
            type: 'business',
            stage: 'INBOUND_QC',
            receiveNodeKey: 'visual-check',
            recoverable: true,
            resumePolicy: 'manual_review',
            summary: '입고 상품 외관에 파손·오염·변형이 발견되어 검수에서 보류되었습니다.',
            actions: [
                { id: 'quarantine_batch', label: '불량 격리 후 재검수', nextStage: 'INBOUND_QC' },
                { id: 'return_to_supplier', label: '공급사 반품' },
                { id: 'cancel_order', label: '입고 요청 반려' },
            ],
        },
        {
            code: 'INBOUND_QC_LABEL_MISMATCH',
            label: '라벨 불일치',
            domain: 'INBOUND',
            type: 'data',
            stage: 'INBOUND_QC',
            receiveNodeKey: 'label-check',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '발주서 품목·수량과 실물 라벨이 일치하지 않습니다.',
            actions: [
                { id: 'retry_validation', label: '라벨 재확인 후 재검수', nextStage: 'INBOUND_QC' },
                { id: 'return_to_supplier', label: '공급사 반품' },
            ],
        },
        {
            code: 'INBOUND_QC_CERT_MISSING',
            label: '성적서 누락',
            domain: 'INBOUND',
            type: 'data',
            stage: 'INBOUND_QC',
            receiveNodeKey: 'certificate-check',
            recoverable: true,
            resumePolicy: 'manual_review',
            summary: '품질 성적서 또는 원산지 증명서 등 필수 서류가 누락되었습니다.',
            actions: [
                { id: 'retry_validation', label: '서류 재제출 후 재검수', nextStage: 'INBOUND_QC' },
                { id: 'cancel_order', label: '입고 요청 반려' },
            ],
        },
        {
            code: 'INBOUND_QC_DEFECT_REJECT',
            label: '불량 판정 반품',
            domain: 'INBOUND',
            type: 'business',
            stage: 'INBOUND_QC',
            receiveNodeKey: 'defect-decision',
            recoverable: false,
            resumePolicy: 'cancel_only',
            summary: '검수 결과 불량 판정이 내려져 재고 반영 없이 반품 또는 폐기 처리됩니다.',
            actions: [
                { id: 'return_to_supplier', label: '공급사 반품' },
                { id: 'dispose', label: '폐기 처리' },
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
    INBOUND_COMPLETED: [
        {
            code: 'INBOUND_STOCK_CONFIRM_FAILED',
            label: '재고 반영 확정 실패',
            domain: 'INBOUND',
            type: 'system',
            stage: 'INBOUND_COMPLETED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: '재고 반영 최종 확정 중 오류가 발생했습니다.',
            actions: [
                { id: 'retry_confirm', label: '재고 반영 재시도', nextStage: 'INBOUND_COMPLETED' },
            ],
        },
        {
            code: 'INBOUND_EOS_HANDOFF_FAILED',
            label: 'EOS 통보 실패',
            domain: 'INBOUND',
            type: 'external',
            stage: 'INBOUND_COMPLETED',
            recoverable: true,
            resumePolicy: 'retry_current_stage',
            summary: 'EOS 측 입고 완결 통보가 실패했습니다.',
            actions: [
                { id: 'retry_handoff', label: 'EOS 재통보', nextStage: 'INBOUND_COMPLETED' },
                { id: 'skip_handoff', label: '통보 건너뜀 (수동 처리)' },
            ],
        },
    ],
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
    WMS_COMPLETED: [],
    QMS_REQUESTED: [
        { code: 'QMS_REQUEST_INGEST_FAILED', label: '검사 요청 수신 실패', domain: 'QMS', type: 'system', stage: 'QMS_REQUESTED', receiveNodeKey: 'request-ingest', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'WMS 패킹완료 이벤트를 수신하지 못했거나 메시지 파싱에 실패했습니다.', actions: [{ id: 'replay_event', label: 'WMS 이벤트 재수신', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'request-ingest' }, { id: 'cancel_order', label: '검사 요청 취소' }] },
        { code: 'QMS_DUPLICATE_INSPECTION_REQUEST', label: '중복 검사 요청', domain: 'QMS', type: 'data', stage: 'QMS_REQUESTED', receiveNodeKey: 'request-ingest', recoverable: true, resumePolicy: 'retry_current_stage', summary: '동일 배치에 대한 검사 요청이 이미 처리 중이거나 완료되어 있습니다.', actions: [{ id: 'retry_validation', label: '중복 확인 후 재접수', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'request-ingest' }, { id: 'cancel_order', label: '중복 요청 취소' }] },
        { code: 'QMS_BATCH_NOT_FOUND', label: '배치 정보 없음', domain: 'QMS', type: 'data', stage: 'QMS_REQUESTED', receiveNodeKey: 'batch-lookup', recoverable: true, resumePolicy: 'retry_current_stage', summary: '검사 대상 배치·로트 정보를 시스템에서 조회할 수 없습니다.', actions: [{ id: 'refresh_batch', label: '배치 정보 재조회', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'batch-lookup' }, { id: 'notify_customer', label: 'WMS 담당자 확인 요청' }] },
        { code: 'QMS_BATCH_ITEM_MISMATCH', label: '배치 품목 불일치', domain: 'QMS', type: 'data', stage: 'QMS_REQUESTED', receiveNodeKey: 'batch-lookup', recoverable: true, resumePolicy: 'manual_review', summary: '이벤트의 품목 코드와 배치 등록 품목이 일치하지 않습니다.', actions: [{ id: 'refresh_batch', label: '배치 재조회 후 비교', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'batch-lookup' }, { id: 'notify_customer', label: 'WMS·OMS 담당자 확인 요청' }] },
        { code: 'QMS_POLICY_NOT_FOUND', label: '검사 정책 미등록', domain: 'QMS', type: 'data', stage: 'QMS_REQUESTED', receiveNodeKey: 'policy-match', recoverable: true, resumePolicy: 'manual_review', summary: '해당 화주·품목 조합에 맞는 검사 정책이 등록되어 있지 않습니다.', actions: [{ id: 'assign_default_policy', label: '기본 검사 정책 임시 적용', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'policy-match' }, { id: 'notify_customer', label: '정책 등록 요청' }] },
        { code: 'QMS_POLICY_VERSION_CONFLICT', label: '검사 정책 버전 충돌', domain: 'QMS', type: 'data', stage: 'QMS_REQUESTED', receiveNodeKey: 'policy-match', recoverable: true, resumePolicy: 'retry_current_stage', summary: '적용할 정책이 둘 이상 존재하거나 버전 간 충돌이 발생했습니다.', actions: [{ id: 'retry_validation', label: '최신 정책 버전으로 재매칭', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'policy-match' }, { id: 'assign_default_policy', label: '기본 정책 임시 적용' }] },
        { code: 'QMS_INSPECTION_TYPE_UNDEFINED', label: '검사 유형 미정의', domain: 'QMS', type: 'data', stage: 'QMS_REQUESTED', receiveNodeKey: 'inspection-type-classify', recoverable: true, resumePolicy: 'manual_review', summary: '정책과 배치 조건으로 검사 유형을 결정할 수 없습니다.', actions: [{ id: 'override_inspection_type', label: '검사 유형 수동 지정', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'inspection-type-classify' }, { id: 'assign_default_policy', label: '기본 정책으로 유형 재결정' }] },
        { code: 'QMS_MIXED_BATCH_TYPE_CONFLICT', label: '혼합 배치 유형 충돌', domain: 'QMS', type: 'business', stage: 'QMS_REQUESTED', receiveNodeKey: 'inspection-type-classify', recoverable: true, resumePolicy: 'manual_review', summary: '배치 내 품목 유형이 혼합되어 단일 검사 유형을 결정할 수 없습니다.', actions: [{ id: 'override_inspection_type', label: '유형 수동 지정', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'inspection-type-classify' }, { id: 'notify_customer', label: 'WMS 담당자 배치 분리 요청' }] },
        { code: 'QMS_SLA_GRADE_UNKNOWN', label: 'SLA 등급 불명', domain: 'QMS', type: 'data', stage: 'QMS_REQUESTED', receiveNodeKey: 'priority-set', recoverable: true, resumePolicy: 'retry_current_stage', summary: '화주 계약에서 SLA 등급을 확인할 수 없어 우선순위를 결정하지 못했습니다.', actions: [{ id: 'retry_validation', label: '계약 정보 재조회 후 재분류', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'priority-set' }, { id: 'assign_default_policy', label: '기본 우선순위 적용' }] },
        { code: 'QMS_AUDIT_INIT_FAILED', label: '감사 로그 초기화 실패', domain: 'QMS', type: 'system', stage: 'QMS_REQUESTED', receiveNodeKey: 'audit-init', recoverable: true, resumePolicy: 'retry_current_stage', summary: '검사 이력 추적 체인 생성에 실패해 감사 로그를 시작할 수 없습니다.', actions: [{ id: 'replay_event', label: '감사 로그 재초기화', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'audit-init' }, { id: 'cancel_order', label: '검사 요청 취소 (추적 불가)' }] },
        { code: 'QMS_SAMPLING_QUEUE_FULL', label: '샘플링 큐 포화', domain: 'QMS', type: 'capacity', stage: 'QMS_REQUESTED', receiveNodeKey: 'next-queue', recoverable: true, resumePolicy: 'retry_current_stage', summary: '샘플추출 대기 큐가 가득 차 새 건을 등록할 수 없습니다.', actions: [{ id: 'retry_validation', label: '큐 여유 확인 후 재등록', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'next-queue' }, { id: 'notify_customer', label: 'QMS 운영팀 알림' }] },
        { code: 'QMS_SAMPLING_QUEUE_FAILED', label: '샘플링 큐 적재 실패', domain: 'QMS', type: 'system', stage: 'QMS_REQUESTED', receiveNodeKey: 'next-queue', recoverable: true, resumePolicy: 'retry_current_stage', summary: '메시지 브로커 오류로 샘플링 큐에 이벤트를 적재하지 못했습니다.', actions: [{ id: 'replay_event', label: '이벤트 재발행', nextStage: 'QMS_REQUESTED', nextReceiveNodeKey: 'next-queue' }, { id: 'cancel_order', label: '검사 요청 취소' }] },
    ],
    QMS_SAMPLING: [
        { code: 'QMS_SAMPLING_PLAN_FAILED', label: '샘플링 계획 수립 실패', domain: 'QMS', type: 'system', stage: 'QMS_SAMPLING', receiveNodeKey: 'plan-build', recoverable: true, resumePolicy: 'retry_current_stage', summary: '검사 정책 파라미터 오류로 샘플링 계획을 생성하지 못했습니다.', actions: [{ id: 'retry_validation', label: '정책 파라미터 재확인 후 재시도', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'plan-build' }, { id: 'assign_default_policy', label: '기본 샘플링 계획 적용' }] },
        { code: 'QMS_BATCH_SIZE_INVALID', label: '배치 크기 불명', domain: 'QMS', type: 'data', stage: 'QMS_SAMPLING', receiveNodeKey: 'plan-build', recoverable: true, resumePolicy: 'manual_review', summary: '배치 수량 정보가 없거나 0·음수여서 샘플링 계획을 수립할 수 없습니다.', actions: [{ id: 'refresh_batch', label: '배치 수량 재조회', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'plan-build' }, { id: 'notify_customer', label: 'WMS 담당자 수량 확인 요청' }] },
        { code: 'QMS_AQL_PARAM_MISSING', label: 'AQL 파라미터 누락', domain: 'QMS', type: 'data', stage: 'QMS_SAMPLING', receiveNodeKey: 'aql-calc', recoverable: true, resumePolicy: 'manual_review', summary: 'AQL 레벨·검사 수준 파라미터가 정책에 정의되지 않아 표본 수를 계산할 수 없습니다.', actions: [{ id: 'assign_default_policy', label: '기본 AQL 파라미터 적용', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'aql-calc' }, { id: 'notify_customer', label: '정책 관리자 AQL 등록 요청' }] },
        { code: 'QMS_AQL_CALC_ERROR', label: 'AQL 계산 오류', domain: 'QMS', type: 'system', stage: 'QMS_SAMPLING', receiveNodeKey: 'aql-calc', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'AQL 표본 수·합격 기준 계산 중 시스템 오류가 발생했습니다.', actions: [{ id: 'retry_validation', label: '계산 재시도', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'aql-calc' }, { id: 'assign_default_policy', label: '표준 AQL II 기본값 적용' }] },
        { code: 'QMS_SAMPLE_LOCATION_UNKNOWN', label: '샘플 위치 불명', domain: 'QMS', type: 'data', stage: 'QMS_SAMPLING', receiveNodeKey: 'sample-pick', recoverable: true, resumePolicy: 'manual_review', summary: '추출 대상 샘플의 창고 위치를 확인할 수 없습니다.', actions: [{ id: 'refresh_batch', label: '위치 정보 재조회', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'sample-pick' }, { id: 'notify_customer', label: 'WMS 로케이션 담당자 확인 요청' }] },
        { code: 'QMS_SAMPLE_PICK_FAILED', label: '샘플 물리적 추출 실패', domain: 'QMS', type: 'business', stage: 'QMS_SAMPLING', receiveNodeKey: 'sample-pick', recoverable: true, resumePolicy: 'manual_review', summary: '작업자가 지정 위치에서 샘플을 추출하지 못했습니다.', actions: [{ id: 'resample', label: '대체 위치에서 재샘플링', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'sample-pick' }, { id: 'quarantine_batch', label: '배치 격리 후 수동 검토' }] },
        { code: 'QMS_SAMPLE_COUNT_INSUFFICIENT', label: '샘플 추출 수량 부족', domain: 'QMS', type: 'capacity', stage: 'QMS_SAMPLING', receiveNodeKey: 'sample-pick', recoverable: true, resumePolicy: 'manual_review', summary: 'AQL 계획 표본 수보다 실제 추출 가능한 재고가 부족합니다.', actions: [{ id: 'resample', label: '가용 수량으로 재계획', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'plan-build' }, { id: 'quarantine_batch', label: '배치 격리 후 수량 재확인' }] },
        { code: 'QMS_TAG_ISSUE_FAILED', label: '샘플 태그 발급 실패', domain: 'QMS', type: 'system', stage: 'QMS_SAMPLING', receiveNodeKey: 'sample-tag', recoverable: true, resumePolicy: 'retry_current_stage', summary: '바코드·QR 태그 생성 또는 프린터 출력에 실패했습니다.', actions: [{ id: 'replay_event', label: '태그 재발급', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'sample-tag' }, { id: 'notify_customer', label: '프린터·태그 시스템 점검 요청' }] },
        { code: 'QMS_BARCODE_DUPLICATE', label: '샘플 바코드 중복', domain: 'QMS', type: 'data', stage: 'QMS_SAMPLING', receiveNodeKey: 'sample-tag', recoverable: true, resumePolicy: 'retry_current_stage', summary: '발급된 샘플 바코드가 이미 등록된 다른 샘플과 충돌합니다.', actions: [{ id: 'replay_event', label: '신규 바코드 재발급', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'sample-tag' }, { id: 'retry_validation', label: '바코드 시퀀스 재초기화 후 재시도' }] },
        { code: 'QMS_SAMPLE_REGISTER_FAILED', label: '샘플 등록 실패', domain: 'QMS', type: 'system', stage: 'QMS_SAMPLING', receiveNodeKey: 'sample-register', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 샘플 목록을 검사 대상으로 등록하지 못했습니다.', actions: [{ id: 'replay_event', label: '샘플 등록 재시도', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'sample-register' }, { id: 'cancel_order', label: '샘플링 취소 (등록 불가)' }] },
        { code: 'QMS_SAMPLE_COUNT_MISMATCH', label: '샘플 수량 불일치', domain: 'QMS', type: 'data', stage: 'QMS_SAMPLING', receiveNodeKey: 'sample-register', recoverable: true, resumePolicy: 'manual_review', summary: '계획된 표본 수와 실제 등록 수량이 달라 검사 신뢰성을 확보할 수 없습니다.', actions: [{ id: 'resample', label: '부족 수량 재추출 후 재등록', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'sample-pick' }, { id: 'quarantine_batch', label: '배치 격리 후 수동 검토' }] },
        { code: 'QMS_INSPECTOR_UNAVAILABLE', label: '검사자 없음', domain: 'QMS', type: 'capacity', stage: 'QMS_SAMPLING', receiveNodeKey: 'inspector-assign', recoverable: true, resumePolicy: 'retry_current_stage', summary: '현재 배정 가능한 검사 담당자가 없습니다.', actions: [{ id: 'reallocate_inspector', label: '대기 검사자 재배정', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'inspector-assign' }, { id: 'notify_customer', label: 'QMS 운영팀 인력 확보 요청' }] },
        { code: 'QMS_INSPECTOR_SKILL_INSUFFICIENT', label: '검사자 전문 등급 부족', domain: 'QMS', type: 'capacity', stage: 'QMS_SAMPLING', receiveNodeKey: 'inspector-assign', recoverable: true, resumePolicy: 'manual_review', summary: '이번 검사 항목에 필요한 전문 등급을 가진 검사자를 배정할 수 없습니다.', actions: [{ id: 'reallocate_inspector', label: '상위 등급 검사자 재배정', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'inspector-assign' }, { id: 'notify_customer', label: '외부 검사 의뢰 승인 요청' }] },
        { code: 'QMS_TOOL_NOT_READY', label: '검사 도구 미준비', domain: 'QMS', type: 'capacity', stage: 'QMS_SAMPLING', receiveNodeKey: 'tool-prepare', recoverable: true, resumePolicy: 'retry_current_stage', summary: '필요한 검사 장비·체크리스트가 준비되지 않았습니다.', actions: [{ id: 'retry_validation', label: '도구 준비 완료 후 재확인', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'tool-prepare' }, { id: 'notify_customer', label: '장비 담당자 준비 요청' }] },
        { code: 'QMS_TOOL_CALIBRATION_EXPIRED', label: '검사 도구 검교정 만료', domain: 'QMS', type: 'business', stage: 'QMS_SAMPLING', receiveNodeKey: 'tool-prepare', recoverable: true, resumePolicy: 'manual_review', summary: '계측 도구의 검교정 유효기간이 만료되어 측정 결과를 신뢰할 수 없습니다.', actions: [{ id: 'recalibrate_tool', label: '도구 재검교정 완료 후 재시도', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'tool-prepare' }, { id: 'notify_customer', label: '검교정 담당자 긴급 점검 요청' }] },
        { code: 'QMS_INSPECTION_QUEUE_FAILED', label: '검사 진행 큐 적재 실패', domain: 'QMS', type: 'system', stage: 'QMS_SAMPLING', receiveNodeKey: 'next-queue', recoverable: true, resumePolicy: 'retry_current_stage', summary: '메시지 브로커 오류로 검사진행 큐에 이벤트를 적재하지 못했습니다.', actions: [{ id: 'replay_event', label: '이벤트 재발행', nextStage: 'QMS_SAMPLING', nextReceiveNodeKey: 'next-queue' }, { id: 'cancel_order', label: '샘플링 취소' }] },
    ],
    QMS_INSPECTING: [
        { code: 'QMS_TOOL_ZERO_OFFSET_ERROR', label: '계측 도구 영점 오류', domain: 'QMS', type: 'system', stage: 'QMS_INSPECTING', receiveNodeKey: 'tool-calibrate', recoverable: true, resumePolicy: 'retry_current_stage', summary: '계측 도구의 영점이 허용 오차를 벗어나 측정 결과를 신뢰할 수 없습니다.', actions: [{ id: 'recalibrate_tool', label: '영점 재조정 후 재확인', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'tool-calibrate' }, { id: 'notify_customer', label: '장비 담당자 점검 요청' }] },
        { code: 'QMS_TOOL_HARDWARE_FAULT', label: '계측 도구 하드웨어 오류', domain: 'QMS', type: 'system', stage: 'QMS_INSPECTING', receiveNodeKey: 'tool-calibrate', recoverable: true, resumePolicy: 'manual_review', summary: '계측 장비 자체 오류로 정상 가동이 불가능합니다.', actions: [{ id: 'recalibrate_tool', label: '대체 장비로 교체 후 재시작', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'tool-calibrate' }, { id: 'notify_customer', label: '장비 수리·교체 요청' }] },
        { code: 'QMS_VISUAL_DEFECT_DETECTED', label: '외관 불량 발견', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'visual-check', recoverable: true, resumePolicy: 'manual_review', summary: '샘플에서 파손·긁힘·찌그러짐 등 외관 결함이 발견되었습니다.', actions: [{ id: 'reinspect', label: '결함 범위 재확인 후 판정 위임', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'result-record' }, { id: 'quarantine_batch', label: '배치 격리 후 전수 검사 요청' }, { id: 'cancel_order', label: '심각 결함 시 주문 취소' }, { id: 'dispose', label: '심각 결함 확정 시 폐기' }] },
        { code: 'QMS_VISUAL_CONTAMINATION', label: '외관 오염 발견', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'visual-check', recoverable: true, resumePolicy: 'manual_review', summary: '샘플 표면에 이물질·오염이 발견되어 출고 기준에 미달합니다.', actions: [{ id: 'reinspect', label: '오염 정도 재확인', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'result-record' }, { id: 'repack', label: '재포장·재세척 후 재검사', nextStage: 'WMS_PACKED', nextReceiveNodeKey: 'box-select' }, { id: 'quarantine_batch', label: '배치 격리' }] },
        { code: 'QMS_VISUAL_COLOR_MISMATCH', label: '색상·형상 불일치', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'visual-check', recoverable: true, resumePolicy: 'manual_review', summary: '샘플 색상 또는 형상이 주문 스펙과 다릅니다.', actions: [{ id: 'reinspect', label: '전체 배치 색상 재확인', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'visual-check' }, { id: 'quarantine_batch', label: '배치 격리 후 OMS 확인 요청' }, { id: 'return_to_supplier', label: '색상 불일치 공급사 반품' }] },
        { code: 'QMS_WEIGHT_OUT_OF_RANGE', label: '중량 기준 이탈', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'weight-check', recoverable: true, resumePolicy: 'manual_review', summary: '실측 중량이 기준값 허용 오차를 벗어났습니다.', actions: [{ id: 'reinspect', label: '재측정 후 판정 위임', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'weight-check' }, { id: 'recalibrate_tool', label: '저울 재검교정 후 재측정', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'tool-calibrate' }, { id: 'quarantine_batch', label: '배치 격리 후 수동 검토' }] },
        { code: 'QMS_WEIGHT_UNDERFLOW', label: '결품 의심', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'weight-check', recoverable: true, resumePolicy: 'manual_review', summary: '실측 중량이 기준보다 현저히 낮아 내용물 부족·누락이 의심됩니다.', actions: [{ id: 'reinspect', label: '내용물 개봉 확인 후 재측정', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'weight-check' }, { id: 'quarantine_batch', label: '배치 격리 후 전수 확인' }, { id: 'cancel_order', label: '결품 확인 시 주문 취소' }] },
        { code: 'QMS_LABEL_MISMATCH', label: '라벨 내용 불일치', domain: 'QMS', type: 'data', stage: 'QMS_INSPECTING', receiveNodeKey: 'label-check', recoverable: true, resumePolicy: 'manual_review', summary: '운송장·바코드·내용물 표기가 주문 정보와 일치하지 않습니다.', actions: [{ id: 'reprint_label', label: '올바른 라벨 재출력·재부착', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'label-check' }, { id: 'quarantine_batch', label: '배치 격리 후 OMS·WMS 확인' }] },
        { code: 'QMS_BARCODE_UNREADABLE', label: '바코드 판독 불가', domain: 'QMS', type: 'data', stage: 'QMS_INSPECTING', receiveNodeKey: 'label-check', recoverable: true, resumePolicy: 'retry_current_stage', summary: '바코드가 손상·인쇄 불량으로 스캔되지 않습니다.', actions: [{ id: 'reprint_label', label: '바코드 재출력·재부착', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'label-check' }, { id: 'retry_validation', label: '수동 입력 후 재검증' }] },
        { code: 'QMS_LABEL_MISSING', label: '라벨 누락', domain: 'QMS', type: 'data', stage: 'QMS_INSPECTING', receiveNodeKey: 'label-check', recoverable: true, resumePolicy: 'manual_review', summary: '운송장 또는 상품 라벨이 부착되어 있지 않습니다.', actions: [{ id: 'reprint_label', label: '라벨 신규 출력·부착', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'label-check' }, { id: 'quarantine_batch', label: '배치 격리 후 WMS 확인' }] },
        { code: 'QMS_FUNCTION_TEST_FAILED', label: '기능 불량', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'function-test', recoverable: true, resumePolicy: 'manual_review', summary: '전원·동작·핵심 기능 점검에서 불량이 발견되었습니다.', actions: [{ id: 'reinspect', label: '추가 샘플로 재검사', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'function-test' }, { id: 'quarantine_batch', label: '배치 격리 후 제조사 확인 요청' }, { id: 'cancel_order', label: '기능 불량 확정 시 주문 취소' }, { id: 'return_to_supplier', label: '기능 불량 확정 시 공급사 반품' }] },
        { code: 'QMS_FUNCTION_SPEC_UNDERPERFORM', label: '기능 스펙 미달', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'function-test', recoverable: true, resumePolicy: 'manual_review', summary: '핵심 스펙 수치가 제품 사양 허용 범위보다 낮게 측정되었습니다.', actions: [{ id: 'reinspect', label: '전수 스펙 재측정', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'function-test' }, { id: 'quarantine_batch', label: '배치 격리 후 공급사 클레임' }, { id: 'return_to_supplier', label: '스펙 미달 공급사 클레임 반품' }] },
        { code: 'QMS_PACKAGE_DAMAGED', label: '포장 파손', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'package-integrity', recoverable: true, resumePolicy: 'manual_review', summary: '외부 박스 또는 내부 포장이 파손되어 배송 중 상품 손상 위험이 있습니다.', actions: [{ id: 'repack', label: '재포장 후 재검사', nextStage: 'WMS_PACKED', nextReceiveNodeKey: 'box-select' }, { id: 'quarantine_batch', label: '파손 심각 시 격리' }, { id: 'cancel_order', label: '재포장 불가 시 주문 취소' }] },
        { code: 'QMS_CUSHION_MATERIAL_MISSING', label: '완충재 누락', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'package-integrity', recoverable: true, resumePolicy: 'retry_current_stage', summary: '내부 완충재가 누락되어 배송 충격 보호가 불충분합니다.', actions: [{ id: 'repack', label: '완충재 보충 후 재포장·재검사', nextStage: 'WMS_PACKED', nextReceiveNodeKey: 'box-select' }, { id: 'notify_customer', label: 'WMS 패킹팀 확인 요청' }] },
        { code: 'QMS_SEAL_BROKEN', label: '밀봉 불량', domain: 'QMS', type: 'business', stage: 'QMS_INSPECTING', receiveNodeKey: 'package-integrity', recoverable: true, resumePolicy: 'retry_current_stage', summary: '테이프·밀봉재가 제대로 부착되지 않아 배송 중 개봉 위험이 있습니다.', actions: [{ id: 'repack', label: '재밀봉 후 재검사', nextStage: 'WMS_PACKED', nextReceiveNodeKey: 'box-select' }, { id: 'notify_customer', label: 'WMS 패킹팀 확인 요청' }] },
        { code: 'QMS_EVIDENCE_UPLOAD_FAILED', label: '검사 증빙 업로드 실패', domain: 'QMS', type: 'system', stage: 'QMS_INSPECTING', receiveNodeKey: 'evidence-capture', recoverable: true, resumePolicy: 'retry_current_stage', summary: '검사 사진·측정값을 감사 시스템에 업로드하지 못했습니다.', actions: [{ id: 'replay_event', label: '증빙 재업로드', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'evidence-capture' }, { id: 'notify_customer', label: '스토리지 시스템 점검 요청' }] },
        { code: 'QMS_EVIDENCE_INCOMPLETE', label: '검사 증빙 미완료', domain: 'QMS', type: 'data', stage: 'QMS_INSPECTING', receiveNodeKey: 'evidence-capture', recoverable: true, resumePolicy: 'manual_review', summary: '필수 검사 항목의 사진 또는 측정값이 누락되어 증빙이 불완전합니다.', actions: [{ id: 'reinspect', label: '누락 항목 보완 촬영 후 재업로드', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'evidence-capture' }, { id: 'notify_customer', label: '검사자 보완 요청' }] },
        { code: 'QMS_RESULT_RECORD_FAILED', label: '검사 결과 기록 실패', domain: 'QMS', type: 'system', stage: 'QMS_INSPECTING', receiveNodeKey: 'result-record', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 검사 완료 레코드를 생성하지 못했습니다.', actions: [{ id: 'replay_event', label: '결과 기록 재시도', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'result-record' }, { id: 'cancel_order', label: '기록 불가 시 검사 취소' }] },
        { code: 'QMS_INCOMPLETE_ITEMS_REMAIN', label: '미완료 검사 항목 잔존', domain: 'QMS', type: 'data', stage: 'QMS_INSPECTING', receiveNodeKey: 'result-record', recoverable: true, resumePolicy: 'manual_review', summary: '일부 검사 항목이 미완료 상태로 남아 있어 종합 레코드를 생성할 수 없습니다.', actions: [{ id: 'reinspect', label: '미완료 항목 재검사 후 기록', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'result-record' }, { id: 'force_pass', label: '운영자 강제 통과 승인', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'result-record' }] },
    ],
    QMS_JUDGED: [
        { code: 'QMS_CRITERIA_NOT_FOUND', label: '합격 기준 미등록', domain: 'QMS', type: 'data', stage: 'QMS_JUDGED', receiveNodeKey: 'criteria-load', recoverable: true, resumePolicy: 'manual_review', summary: '해당 화주·품목에 맞는 합격 기준이 시스템에 등록되어 있지 않습니다.', actions: [{ id: 'assign_default_policy', label: '기본 합격 기준 임시 적용', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'criteria-load' }, { id: 'notify_customer', label: '기준 등록 담당자 확인 요청' }] },
        { code: 'QMS_CRITERIA_VERSION_MISMATCH', label: '합격 기준 버전 불일치', domain: 'QMS', type: 'data', stage: 'QMS_JUDGED', receiveNodeKey: 'criteria-load', recoverable: true, resumePolicy: 'retry_current_stage', summary: '검사 정책 버전과 합격 기준 버전이 달라 적용할 기준을 특정할 수 없습니다.', actions: [{ id: 'retry_validation', label: '최신 버전 기준으로 재로드', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'criteria-load' }, { id: 'assign_default_policy', label: '기본 기준 임시 적용' }] },
        { code: 'QMS_CRITERIA_APPLY_INCOMPLETE', label: '기준 적용 대조 불완전', domain: 'QMS', type: 'data', stage: 'QMS_JUDGED', receiveNodeKey: 'criteria-apply', recoverable: true, resumePolicy: 'manual_review', summary: '검사 결과 레코드에 누락된 항목이 있어 전체 기준 대조를 완료할 수 없습니다.', actions: [{ id: 'reinspect', label: '누락 항목 재검사 후 재대조', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'result-record' }, { id: 'escalate_judgment', label: '판정 권한자에게 불완전 대조 보고' }] },
        { code: 'QMS_CRITERIA_APPLY_ERROR', label: '기준 적용 시스템 오류', domain: 'QMS', type: 'system', stage: 'QMS_JUDGED', receiveNodeKey: 'criteria-apply', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 검사 결과와 합격 기준 대조 연산이 실패했습니다.', actions: [{ id: 'replay_event', label: '대조 연산 재시도', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'criteria-apply' }, { id: 'notify_customer', label: '시스템 담당자 점검 요청' }] },
        { code: 'QMS_DEFECT_CLASSIFY_FAILED', label: '결함 분류 시스템 오류', domain: 'QMS', type: 'system', stage: 'QMS_JUDGED', receiveNodeKey: 'defect-classify', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 결함을 치명·중대·경미 등급으로 분류하지 못했습니다.', actions: [{ id: 'replay_event', label: '분류 재시도', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'defect-classify' }, { id: 'escalate_judgment', label: '수동 등급 지정 요청' }] },
        { code: 'QMS_DEFECT_GRADE_AMBIGUOUS', label: '결함 등급 결정 모호', domain: 'QMS', type: 'business', stage: 'QMS_JUDGED', receiveNodeKey: 'defect-classify', recoverable: true, resumePolicy: 'manual_review', summary: '복합 결함 또는 경계 사례로 인해 결함 등급을 자동으로 결정할 수 없습니다.', actions: [{ id: 'escalate_judgment', label: '품질 담당자 수동 등급 지정', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'defect-classify' }, { id: 'quarantine_batch', label: '결정 전 배치 격리' }] },
        { code: 'QMS_JUDGMENT_RULE_CONFLICT', label: '판정 규칙 충돌', domain: 'QMS', type: 'business', stage: 'QMS_JUDGED', receiveNodeKey: 'judgment-decide', recoverable: true, resumePolicy: 'manual_review', summary: '둘 이상의 판정 규칙이 서로 상충되어 Pass/Fail/Hold를 자동으로 결정할 수 없습니다.', actions: [{ id: 'escalate_judgment', label: '품질 책임자 최종 판정 요청', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'judgment-decide' }, { id: 'quarantine_batch', label: '판정 전 배치 격리' }] },
        { code: 'QMS_JUDGMENT_PENDING', label: '판정 보류 — 권한자 부재', domain: 'QMS', type: 'external', stage: 'QMS_JUDGED', receiveNodeKey: 'judgment-decide', recoverable: true, resumePolicy: 'manual_review', summary: '판정 권한을 가진 담당자가 없어 최종 판정이 보류되었습니다.', actions: [{ id: 'escalate_judgment', label: '상위 권한자에게 에스컬레이션', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'judgment-decide' }, { id: 'quarantine_batch', label: '판정 완료 전 배치 격리 유지' }] },
        { code: 'QMS_HOLD_ZONE_FULL', label: '격리 구역 포화', domain: 'QMS', type: 'capacity', stage: 'QMS_JUDGED', receiveNodeKey: 'hold-route', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'QMS 격리 구역이 가득 차 Hold 배치를 수용할 공간이 없습니다.', actions: [{ id: 'notify_customer', label: 'QMS 운영팀 격리 공간 확보 요청' }, { id: 'retry_validation', label: '공간 확보 후 재라우팅', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'hold-route' }] },
        { code: 'QMS_HOLD_ROUTE_FAILED', label: '격리 라우팅 시스템 오류', domain: 'QMS', type: 'system', stage: 'QMS_JUDGED', receiveNodeKey: 'hold-route', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 Hold 배치를 격리 구역으로 라우팅하지 못했습니다.', actions: [{ id: 'replay_event', label: '라우팅 재시도', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'hold-route' }, { id: 'notify_customer', label: 'WMS 로케이션 시스템 점검 요청' }] },
        { code: 'QMS_FAIL_DISPOSAL_AMBIGUOUS', label: '반품·폐기 경로 결정 불명', domain: 'QMS', type: 'business', stage: 'QMS_JUDGED', receiveNodeKey: 'fail-route', recoverable: true, resumePolicy: 'manual_review', summary: '화주 정책에 반품·폐기 처리 방침이 명시되지 않아 Fail 배치의 처리 경로를 결정할 수 없습니다.', actions: [{ id: 'escalate_judgment', label: '화주 담당자에게 처리 방침 확인 요청', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'fail-route' }, { id: 'quarantine_batch', label: '결정 전 배치 격리 유지' }, { id: 'return_to_supplier', label: '공급사 반품 처리' }, { id: 'dispose', label: '폐기 처분 처리' }] },
        { code: 'QMS_OMS_CANCEL_EVENT_FAILED', label: 'OMS 취소 이벤트 발행 실패', domain: 'QMS', type: 'system', stage: 'QMS_JUDGED', receiveNodeKey: 'fail-route', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'Fail 판정 후 OMS에 주문 취소 이벤트를 발행하지 못했습니다.', actions: [{ id: 'replay_event', label: 'OMS 취소 이벤트 재발행', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'fail-route' }, { id: 'notify_customer', label: 'OMS 담당자 수동 취소 요청' }] },
        { code: 'QMS_JUDGMENT_PUBLISH_FAILED', label: '판정 결과 게시 실패', domain: 'QMS', type: 'system', stage: 'QMS_JUDGED', receiveNodeKey: 'judgment-publish', recoverable: true, resumePolicy: 'retry_current_stage', summary: '메시지 브로커 오류로 판정 결과 이벤트를 발행하지 못했습니다.', actions: [{ id: 'replay_event', label: '판정 이벤트 재발행', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'judgment-publish' }, { id: 'notify_customer', label: '메시지 브로커 점검 요청' }] },
        { code: 'QMS_JUDGMENT_AUDIT_FAILED', label: '판정 감사 로그 저장 실패', domain: 'QMS', type: 'system', stage: 'QMS_JUDGED', receiveNodeKey: 'audit-log', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 판정 전 과정의 감사 로그를 저장하지 못했습니다.', actions: [{ id: 'replay_event', label: '감사 로그 재저장', nextStage: 'QMS_JUDGED', nextReceiveNodeKey: 'audit-log' }, { id: 'notify_customer', label: '감사 시스템 점검 요청' }] },
    ],
    QMS_RELEASED: [
        { code: 'QMS_RELEASE_DOC_INCOMPLETE', label: '출고 승인서 필수 정보 불완전', domain: 'QMS', type: 'data', stage: 'QMS_RELEASED', receiveNodeKey: 'release-doc-build', recoverable: true, resumePolicy: 'manual_review', summary: '판정 정보 또는 배치 정보가 불완전해 출고 승인서를 구성할 수 없습니다.', actions: [{ id: 'retry_validation', label: '누락 정보 보완 후 재구성', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'release-doc-build' }, { id: 'escalate_judgment', label: 'QMS 운영팀 수동 승인서 작성 요청' }] },
        { code: 'QMS_RELEASE_DOC_BUILD_FAILED', label: '출고 승인서 생성 시스템 오류', domain: 'QMS', type: 'system', stage: 'QMS_RELEASED', receiveNodeKey: 'release-doc-build', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 출고 승인서 문서 생성에 실패했습니다.', actions: [{ id: 'replay_event', label: '승인서 생성 재시도', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'release-doc-build' }, { id: 'notify_customer', label: '문서 생성 시스템 점검 요청' }] },
        { code: 'QMS_CERT_ATTACH_FAILED', label: '품질 인증서 첨부 실패', domain: 'QMS', type: 'data', stage: 'QMS_RELEASED', receiveNodeKey: 'cert-attach', recoverable: true, resumePolicy: 'retry_current_stage', summary: '검사 증빙 파일이 누락되거나 인증서 생성에 실패해 출고 승인서에 첨부하지 못했습니다.', actions: [{ id: 'replay_event', label: '증빙 재조회 후 인증서 재생성', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'cert-attach' }, { id: 'reinspect', label: '증빙 누락 시 재촬영 후 재업로드', nextStage: 'QMS_INSPECTING', nextReceiveNodeKey: 'evidence-capture' }] },
        { code: 'QMS_TRACEABILITY_BROKEN', label: '추적성 ID 체인 단절', domain: 'QMS', type: 'data', stage: 'QMS_RELEASED', receiveNodeKey: 'traceability-link', recoverable: true, resumePolicy: 'manual_review', summary: '배치·검사·샘플 ID 연결 중 하나가 누락되어 완전한 추적성 체인을 구성할 수 없습니다.', actions: [{ id: 'retry_validation', label: '누락 ID 재조회 후 체인 재구성', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'traceability-link' }, { id: 'escalate_judgment', label: 'QMS 운영팀 수동 추적 정보 보완 요청' }] },
        { code: 'QMS_TRACEABILITY_LINK_FAILED', label: '추적성 연결 시스템 오류', domain: 'QMS', type: 'system', stage: 'QMS_RELEASED', receiveNodeKey: 'traceability-link', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 배치·검사·샘플 ID 연결 작업에 실패했습니다.', actions: [{ id: 'replay_event', label: '추적성 연결 재시도', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'traceability-link' }, { id: 'notify_customer', label: '추적 시스템 점검 요청' }] },
        { code: 'QMS_EVENT_ENVELOPE_INVALID', label: '이벤트 봉투 필수 필드 누락', domain: 'QMS', type: 'data', stage: 'QMS_RELEASED', receiveNodeKey: 'event-envelope', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'TMS 인계 이벤트 봉투에 routingKey·traceId 등 필수 필드가 누락되어 발행할 수 없습니다.', actions: [{ id: 'retry_validation', label: '봉투 필드 재구성 후 재시도', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'event-envelope' }, { id: 'notify_customer', label: '이벤트 구성 담당자 확인 요청' }] },
        { code: 'QMS_TMS_HANDOFF_TIMEOUT', label: 'TMS 인계 타임아웃', domain: 'QMS', type: 'external', stage: 'QMS_RELEASED', receiveNodeKey: 'tms-handoff', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'TMS가 배차 요청 이벤트를 지정 시간 내에 수신하지 못했습니다.', actions: [{ id: 'replay_event', label: 'TMS 인계 이벤트 재발행', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'tms-handoff' }, { id: 'emergency_dispatch', label: '긴급 배차 경로로 대체 발행' }] },
        { code: 'QMS_TMS_HANDOFF_REJECTED', label: 'TMS 배차 요청 거절', domain: 'QMS', type: 'external', stage: 'QMS_RELEASED', receiveNodeKey: 'tms-handoff', recoverable: true, resumePolicy: 'manual_review', summary: 'TMS가 배차 요청을 거절했습니다.', actions: [{ id: 'redispatch', label: '배차 조건 조정 후 재요청', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'tms-handoff' }, { id: 'notify_customer', label: 'TMS·물류 운영팀 확인 요청' }] },
        { code: 'QMS_TMS_ACK_TIMEOUT', label: 'TMS 수신 확인 타임아웃', domain: 'QMS', type: 'external', stage: 'QMS_RELEASED', receiveNodeKey: 'handoff-watch', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'TMS로부터 배차 요청 수신 ACK가 지정 시간 내에 오지 않았습니다.', actions: [{ id: 'replay_event', label: 'ACK 재확인 요청', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'handoff-watch' }, { id: 'emergency_dispatch', label: '긴급 배차 경로로 전환' }] },
        { code: 'QMS_TMS_ACK_NEGATIVE', label: 'TMS 부정 응답 (NACK)', domain: 'QMS', type: 'external', stage: 'QMS_RELEASED', receiveNodeKey: 'handoff-watch', recoverable: true, resumePolicy: 'manual_review', summary: 'TMS가 배차 요청에 대해 처리 불가 응답을 반환했습니다.', actions: [{ id: 'redispatch', label: '배차 조건 재검토 후 재요청', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'tms-handoff' }, { id: 'notify_customer', label: 'TMS 운영팀 처리 불가 사유 확인' }] },
        { code: 'QMS_CLOSE_EVENT_FAILED', label: 'QMS 종료 이벤트 발행 실패', domain: 'QMS', type: 'system', stage: 'QMS_RELEASED', receiveNodeKey: 'close-quality', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 QMS 처리 완료 이벤트를 발행하지 못해 상태가 열린 채로 남았습니다.', actions: [{ id: 'replay_event', label: '종료 이벤트 재발행', nextStage: 'QMS_RELEASED', nextReceiveNodeKey: 'close-quality' }, { id: 'notify_customer', label: '메시지 브로커 점검 요청' }] },
    ],
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
    EOS_FORECASTED: [
        { code: 'EOS_DEMAND_COLLECT_FAILED', label: '수요 데이터 수집 실패', domain: 'EOS', type: 'system', stage: 'EOS_FORECASTED', receiveNodeKey: 'demand-collect', recoverable: true, resumePolicy: 'retry_current_stage', summary: '수요 데이터 소스 조회에 실패해 예측 입력값을 구성하지 못했습니다.', actions: [{ id: 'replay_event', label: '수집 재시도', nextStage: 'EOS_FORECASTED', nextReceiveNodeKey: 'demand-collect' }, { id: 'notify_customer', label: 'EOS 운영팀 확인 요청' }] },
        { code: 'EOS_FORECAST_LOW_CONFIDENCE', label: '예측 신뢰도 부족', domain: 'EOS', type: 'business', stage: 'EOS_FORECASTED', receiveNodeKey: 'forecast-calc', recoverable: true, resumePolicy: 'manual_review', summary: '예측 결과 신뢰도가 임계 이하라 자동 진행을 보류했습니다.', actions: [{ id: 'retry_validation', label: '모델 재계산', nextStage: 'EOS_FORECASTED', nextReceiveNodeKey: 'forecast-calc' }, { id: 'notify_customer', label: '운영자 수동 검토 요청' }] },
    ],
    EOS_REORDER_TRIGGERED: [
        { code: 'EOS_STOCK_LOOKUP_FAILED', label: '재고 조회 실패', domain: 'EOS', type: 'system', stage: 'EOS_REORDER_TRIGGERED', receiveNodeKey: 'stock-check', recoverable: true, resumePolicy: 'retry_current_stage', summary: '재고 시스템에서 현재 수량을 조회하지 못했습니다.', actions: [{ id: 'replay_event', label: '재고 재조회', nextStage: 'EOS_REORDER_TRIGGERED', nextReceiveNodeKey: 'stock-check' }, { id: 'notify_customer', label: 'WMS 담당자 확인 요청' }] },
        { code: 'EOS_REORDER_POINT_UNDEFINED', label: '발주점 미등록', domain: 'EOS', type: 'data', stage: 'EOS_REORDER_TRIGGERED', receiveNodeKey: 'reorder-evaluate', recoverable: true, resumePolicy: 'manual_review', summary: '품목의 발주점(ROP)이 정의되어 있지 않아 자동 평가가 불가능합니다.', actions: [{ id: 'assign_default_policy', label: '기본 ROP 임시 적용', nextStage: 'EOS_REORDER_TRIGGERED', nextReceiveNodeKey: 'reorder-evaluate' }, { id: 'notify_customer', label: '품목 마스터 담당자에게 등록 요청' }] },
    ],
    EOS_SUPPLIER_SELECTED: [
        { code: 'EOS_SUPPLIER_NOT_FOUND', label: '공급사 후보 없음', domain: 'EOS', type: 'data', stage: 'EOS_SUPPLIER_SELECTED', receiveNodeKey: 'supplier-lookup', recoverable: true, resumePolicy: 'manual_review', summary: '발주 대상 품목을 공급 가능한 등록 공급사가 없습니다.', actions: [{ id: 'notify_customer', label: '구매팀 공급사 확보 요청' }, { id: 'cancel_order', label: '발주 취소' }] },
        { code: 'EOS_SUPPLIER_SCORE_TIE', label: '공급사 평가 동점', domain: 'EOS', type: 'business', stage: 'EOS_SUPPLIER_SELECTED', receiveNodeKey: 'supplier-decide', recoverable: true, resumePolicy: 'manual_review', summary: '다수 공급사가 동일 점수로 선정이 자동 결정되지 않았습니다.', actions: [{ id: 'override_inspection_type', label: '운영자 수동 선정', nextStage: 'EOS_SUPPLIER_SELECTED', nextReceiveNodeKey: 'supplier-decide' }, { id: 'notify_customer', label: '구매팀 결정 요청' }] },
    ],
    EOS_PO_ISSUED: [
        { code: 'EOS_PO_APPROVAL_REJECTED', label: '발주 승인 반려', domain: 'EOS', type: 'business', stage: 'EOS_PO_ISSUED', receiveNodeKey: 'po-approve', recoverable: true, resumePolicy: 'manual_review', summary: '승인권자가 발주를 반려했거나 한도를 초과해 승인되지 않았습니다.', actions: [{ id: 'notify_customer', label: '구매팀 한도·승인 재검토 요청' }, { id: 'cancel_order', label: '발주 취소' }] },
        { code: 'EOS_PO_NUMBER_DUPLICATE', label: '발주번호 중복', domain: 'EOS', type: 'data', stage: 'EOS_PO_ISSUED', receiveNodeKey: 'po-issue', recoverable: true, resumePolicy: 'retry_current_stage', summary: '발급한 발주번호가 이미 등록된 다른 발주서와 충돌합니다.', actions: [{ id: 'replay_event', label: '발주번호 재발급', nextStage: 'EOS_PO_ISSUED', nextReceiveNodeKey: 'po-issue' }, { id: 'retry_validation', label: '시퀀스 재초기화 후 재시도' }] },
    ],
    EOS_PO_DISPATCHED: [
        { code: 'EOS_CHANNEL_NOT_REGISTERED', label: '송신 채널 미등록', domain: 'EOS', type: 'data', stage: 'EOS_PO_DISPATCHED', receiveNodeKey: 'channel-prepare', recoverable: true, resumePolicy: 'manual_review', summary: '공급사에 등록된 EDI·이메일·API 송신 채널이 없습니다.', actions: [{ id: 'notify_customer', label: '공급사 담당자에게 채널 등록 요청' }, { id: 'cancel_order', label: '발주 취소' }] },
        { code: 'EOS_PO_SEND_FAILED', label: '발주서 송신 실패', domain: 'EOS', type: 'external', stage: 'EOS_PO_DISPATCHED', receiveNodeKey: 'po-send', recoverable: true, resumePolicy: 'retry_current_stage', summary: '외부 채널 오류로 발주서를 공급사에 전송하지 못했습니다.', actions: [{ id: 'replay_event', label: '재송신', nextStage: 'EOS_PO_DISPATCHED', nextReceiveNodeKey: 'po-send' }, { id: 'notify_customer', label: '공급사 시스템 점검 요청' }] },
        { code: 'EOS_SEND_ACK_TIMEOUT', label: '송신 ACK 타임아웃', domain: 'EOS', type: 'external', stage: 'EOS_PO_DISPATCHED', receiveNodeKey: 'send-ack', recoverable: true, resumePolicy: 'retry_current_stage', summary: '공급사 채널이 송신 ACK를 지정 시간 내에 반환하지 않았습니다.', actions: [{ id: 'replay_event', label: 'ACK 재요청', nextStage: 'EOS_PO_DISPATCHED', nextReceiveNodeKey: 'send-ack' }, { id: 'notify_customer', label: '공급사 운영팀 확인 요청' }] },
    ],
    EOS_PO_CONFIRMED: [
        { code: 'EOS_CONFIRM_TIMEOUT', label: '수신확인 응답 타임아웃', domain: 'EOS', type: 'external', stage: 'EOS_PO_CONFIRMED', receiveNodeKey: 'confirm-wait', recoverable: true, resumePolicy: 'manual_review', summary: '공급사가 수신확인을 지정 기한 내에 회신하지 않았습니다.', actions: [{ id: 'replay_event', label: '확인 요청 재발송', nextStage: 'EOS_PO_CONFIRMED', nextReceiveNodeKey: 'confirm-wait' }, { id: 'notify_customer', label: '공급사 담당자 연락' }] },
        { code: 'EOS_HANDOFF_INBOUND_FAILED', label: 'WMS 입고 핸드오프 실패', domain: 'EOS', type: 'system', stage: 'EOS_PO_CONFIRMED', receiveNodeKey: 'handoff-inbound', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'task의 INBOUND_RECEIVED 전이에 실패해 입고 흐름이 시작되지 않았습니다.', actions: [{ id: 'replay_event', label: '핸드오프 재시도', nextStage: 'EOS_PO_CONFIRMED', nextReceiveNodeKey: 'handoff-inbound' }, { id: 'notify_customer', label: 'WMS 담당자 확인 요청' }] },
    ],
    AFT_BILLING: [
        { code: 'AFT_OMS_CLOSE_FAILED', label: 'OMS 주문완결 요청 실패', domain: 'AFT', type: 'system', stage: 'AFT_BILLING', receiveNodeKey: 'oms-close-request', recoverable: true, resumePolicy: 'retry_current_stage', summary: 'TMS 배송 완료 후 OMS 주문완결 처리 요청이 실패했습니다.', actions: [{ id: 'replay_event', label: 'OMS 완결 요청 재시도', nextStage: 'AFT_BILLING', nextReceiveNodeKey: 'oms-close-request' }, { id: 'notify_customer', label: 'OMS 담당자 확인 요청' }] },
        { code: 'AFT_BILLING_CALC_ERROR', label: '대금 산출 오류', domain: 'AFT', type: 'data', stage: 'AFT_BILLING', receiveNodeKey: 'billing-calc', recoverable: true, resumePolicy: 'manual_review', summary: '주문 금액 또는 실배송비 데이터 불일치로 청구액 산출에 실패했습니다.', actions: [{ id: 'retry_validation', label: '데이터 재확인 후 재산출', nextStage: 'AFT_BILLING', nextReceiveNodeKey: 'billing-calc' }, { id: 'notify_customer', label: '정산 담당자 수동 처리 요청' }] },
        { code: 'AFT_BILLING_ISSUE_FAILED', label: '청구서 발행 실패', domain: 'AFT', type: 'system', stage: 'AFT_BILLING', receiveNodeKey: 'billing-issue', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 화주에게 청구서를 발행하지 못했습니다.', actions: [{ id: 'replay_event', label: '청구서 재발행', nextStage: 'AFT_BILLING', nextReceiveNodeKey: 'billing-issue' }, { id: 'notify_customer', label: '청구 시스템 점검 요청' }] },
    ],
    AFT_CLOSED: [
        { code: 'AFT_SETTLE_CONFIRM_FAILED', label: '정산 확정 실패', domain: 'AFT', type: 'system', stage: 'AFT_CLOSED', receiveNodeKey: 'settle-confirm', recoverable: true, resumePolicy: 'retry_current_stage', summary: '청구·반품 처리 결과 종합 중 오류가 발생해 정산을 확정하지 못했습니다.', actions: [{ id: 'retry_confirm', label: '정산 확정 재시도', nextStage: 'AFT_CLOSED', nextReceiveNodeKey: 'settle-confirm' }, { id: 'notify_customer', label: '정산 담당자 확인 요청' }] },
        { code: 'AFT_ORDER_CLOSE_FAILED', label: '주문 종결 실패', domain: 'AFT', type: 'system', stage: 'AFT_CLOSED', receiveNodeKey: 'order-close', recoverable: true, resumePolicy: 'retry_current_stage', summary: '시스템 오류로 주문 종결 이벤트를 발행하지 못했습니다.', actions: [{ id: 'replay_event', label: '종결 이벤트 재발행', nextStage: 'AFT_CLOSED', nextReceiveNodeKey: 'order-close' }, { id: 'notify_customer', label: '운영팀 수동 종결 처리 요청' }] },
    ],
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
    const isWorkNodeStage = stage.startsWith('OMS_') || stage.startsWith('TMS_') || stage.startsWith('WMS_') || stage.startsWith('QMS_') || stage.startsWith('AFT_');
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
