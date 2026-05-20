// WMS 도메인 상수

export const WMS_SUPPORT_FLOWS = [];

export const WMS_STAGES = [
    'WMS_RECEIVED',
    'WMS_ALLOCATED',
    'WMS_PICKING',
    'WMS_PACKED',
    'WMS_DISPATCHED',
    'WMS_COMPLETED',
];

// 출고 WMS 분할 (QMS 기준 전/후): WMS-1=피킹·패킹, WMS-2=출하 도크 + TMS 인도 후 정산
export const WMS_PICK_STAGES = ['WMS_RECEIVED', 'WMS_ALLOCATED', 'WMS_PICKING', 'WMS_PACKED'];
export const WMS_SHIP_STAGES = ['WMS_DISPATCHED', 'WMS_COMPLETED'];
