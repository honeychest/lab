// 이벤트 + Task 타입 정의
// Routing Key 컨벤션: {aggregate}.{verb}.{past-tense} — 단계1 mitt부터 강제

export interface LogisticEvent {
    eventId: string;
    eventType: string;
    routingKey: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    eventVersion: string;
    actor: string;
    timestamp: number;
    correlationId: string;
    idempotencyKey: string;
}

export type TaskStatus = 'active' | 'paused' | 'failed' | 'completed' | 'cancelled';

export type OmsStage =
    | 'OMS_RECEIVED'
    | 'OMS_VALIDATED'
    | 'OMS_WMS_REQUESTED';

export type OmsReceiveNodeKey =
    | 'raw-ingest'
    | 'owner-match'
    | 'required-fields'
    | 'duplicate-check'
    | 'receipt-key'
    | 'sla-classify'
    | 'next-queue'
    | 'contract-rule'
    | 'item-rule'
    | 'quantity-rule'
    | 'destination-rule'
    | 'payment-check'
    | 'audit-ready'
    | 'shipment-build'
    | 'inventory-hint'
    | 'event-envelope'
    | 'broker-send'
    | 'handoff-watch';

export type TmsWorkNodeKey =
    | 'dispatch-ingest'
    | 'route-calc'
    | 'vehicle-match'
    | 'dispatch-queue'
    | 'vehicle-confirm'
    | 'driver-assign'
    | 'departure-notify'
    | 'cargo-scan'
    | 'load-confirm'
    | 'departure-signal'
    | 'en-route'
    | 'checkpoint'
    | 'arrival-estimate'
    | 'delivery-confirm'
    | 'proof-capture'
    | 'close-order';

export type WmsWorkNodeKey =
    | 'request-ingest'
    | 'duplicate-check'
    | 'work-key'
    | 'stock-check'
    | 'rule-apply'
    | 'stock-reserve'
    | 'shortage-check'
    | 'pick-order'
    | 'worker-assign'
    | 'location-move'
    | 'barcode-scan'
    | 'item-check'
    | 'box-select'
    | 'label-print'
    | 'weight-check'
    | 'dock-assign'
    | 'dispatch-check'
    | 'tms-request'
    | 'tms-sync'
    | 'delay-watch'
    | 'delivery-result'
    | 'stock-confirm'
    | 'audit-close'
    | 'order-close';

export type InboundStage =
    | 'INBOUND_RECEIVED'
    | 'INBOUND_VALIDATED'
    | 'INBOUND_ZONE_ASSIGNED'
    | 'INBOUND_STORED'
    | 'INBOUND_COMPLETED';

export type WmsOutStage =
    | 'WMS_RECEIVED'
    | 'WMS_ALLOCATED'
    | 'WMS_PICKING'
    | 'WMS_PACKED'
    | 'WMS_DISPATCHED'
    | 'WMS_DELIVERING'
    | 'WMS_COMPLETED';

export type TmsStage =
    | 'TMS_REQUESTED'
    | 'TMS_VEHICLE_ASSIGNED'
    | 'TMS_LOADED'
    | 'TMS_DELIVERING'
    | 'TMS_DELIVERED';

export type TaskStage = OmsStage | InboundStage | WmsOutStage | TmsStage;

export type TaskType = 'ORDER' | 'INBOUND';

export interface LogisticsTask {
    taskId: string;
    type: TaskType;
    correlationId: string;
    owner: string;
    itemCode: string;
    quantity: number;
    destination: string;
    currentStage: TaskStage;
    receiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey;
    status: TaskStatus;
    actor: string;
    sourceChannel?: 'operator' | 'owner' | 'auto' | 'bulk';
    ownerView?: boolean;
    zoneCode?: string;
    zoneTemperature?: '상온' | '냉장' | '냉동' | '대형';
    vehicleId?: string;
    boxId?: string;
    createdAt: number;
    updatedAt: number;
    idempotencyKey: string;
    ticksInCurrentStage: number;
    ticksTarget: number;
    failureReason?: string;
    failureCode?: string;
    failureLabel?: string;
    failureDomain?: 'OMS' | 'WMS' | 'TMS' | 'stream';
    failureType?: 'business' | 'system' | 'external' | 'capacity' | 'data';
    failureRecoverable?: boolean;
    failureReceiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey;
    failureActions?: Array<{ id: string; label: string; nextStage?: TaskStage; nextReceiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey }>;
    failureResumePolicy?: 'retry_current_stage' | 'rollback_previous_stage' | 'manual_review' | 'cancel_only';
    simulationGlobalFailureRate?: number;
    simulationStageOverrides?: Partial<Record<TaskStage, number>>;
}

export type HealthAxis = 'OMS' | 'WMS' | 'TMS' | 'stream';
export type HealthStatus = 'ok' | 'warn' | 'error';
