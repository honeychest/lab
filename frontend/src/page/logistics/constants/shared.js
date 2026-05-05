// 이벤트 타입별 한글 라벨 (모든 도메인이 공유)
export const EVENT_LABELS = {
    'order.received': '주문 접수',
    'order.validated': '주문 검증 완료',
    'order.wms.requested': 'WMS 전송 요청',
    'inbound.received': '입고 등록',
    'inbound.validated': '입고 유효성 통과',
    'inbound.zone.assigned': '입고 Zone 배정',
    'inbound.stored': '입고 재고 반영',
    'inbound.completed': '입고 완료',
    'shipment.received': 'WMS 접수',
    'shipment.allocated': '재고 할당 완료',
    'shipment.picking.started': '피킹 시작',
    'shipment.packed': '패킹 완료',
    'shipment.dispatched': '출하 완료',
    'shipment.delivering': '배송 진행',
    'shipment.completed': 'WMS 출고 완료',
    'dispatch.requested': '배차 요청',
    'dispatch.vehicleAssigned': '차량 배정',
    'dispatch.loaded': '상차 완료',
    'dispatch.delivering': '운송 진행',
    'dispatch.delivered': '인도 완료',
    'audit.pause.toggled': '운영자 일시정지/재개',
    'audit.settings.saved': '설정 저장',
    'audit.reset.performed': '초기화 실행',
    'audit.branch.injected': '운영자 분기 주입',
    'audit.recovery.performed': '운영자 조치 실행',
    'task.failed.injected': '운영자 분기 주입 실패',
    'task.failed.simulated': '실패 처리',
    'task.recovered': '조치 후 재개',
};

// 이력 체인 배경색 토큰 (T3-ARCH 결정-10 / DECISION-LOG [8])
export const CHAIN_BG = {
    done:    'rgba(16, 185, 129, 0.12)',
    current: 'rgba(59, 130, 246, 0.2)',
    pending: 'rgba(100, 116, 139, 0.07)',
    fail:    'rgba(239, 68, 68, 0.15)',
    recover: 'rgba(250, 159, 66, 0.16)',
};

// 이력 체인 아이콘
export const CHAIN_ICON = {
    done:    '✓',
    current: '⋯',
    pending: '─',
    fail:    '❌',
    recover: '↺',
};
