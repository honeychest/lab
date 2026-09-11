export const EXECUTION_MODE_OPTIONS = [
    { value: 'OFF', label: '정지', description: '자동 주문을 만들지 않습니다.' },
    { value: 'PAPER', label: '모의', description: '메모리에서만 체결을 시뮬레이션합니다.' },
    { value: 'TEST', label: '검증', description: '바이낸스 매칭 엔진에 제출하지 않고 주문을 검증합니다.' },
    { value: 'LIVE', label: '실거래', description: '실제 선물 주문을 제출합니다.' },
];

export const POSITION_MODE_OPTIONS = [
    { value: 'ONE_WAY', label: 'One-way' },
];

export const PRICE_SOURCE_OPTIONS = [
    { value: 'LAST_PRICE', label: '마지막 체결가' },
];

export const EXECUTION_POLICY_OPTIONS = [
    { value: 'MANUAL', label: '수동 실행' },
    { value: 'AUTO', label: '자동 실행' },
];

export const STRATEGY_FIELDS = [
    { key: 'symbol', label: '심볼', kind: 'symbol' },
    { key: 'baseNotional', label: '최초 명목금액', kind: 'number', step: '0.01', min: '0', suffix: 'USDT' },
    { key: 'addStepPct', label: '물타기 간격', kind: 'percent', step: '0.1', min: '0', suffix: '%' },
    { key: 'takeProfitPct', label: '익절률', kind: 'percent', step: '0.1', min: '0', suffix: '%' },
    { key: 'stopLossPct', label: '손절률', kind: 'percent', step: '0.1', min: '0', suffix: '%' },
    { key: 'martingaleRatio', label: '마틴게일 배율', kind: 'number', step: '0.1', min: '1', suffix: 'x' },
    { key: 'maxAdds', label: '최대 추가 진입', kind: 'number', step: '1', min: '0', suffix: '회' },
    { key: 'positionMode', label: '포지션 모드', kind: 'select', options: POSITION_MODE_OPTIONS },
    { key: 'priceSource', label: '가격 기준', kind: 'select', options: PRICE_SOURCE_OPTIONS },
];

export const EXECUTION_OPERATION_FIELDS = [
    { key: 'policy', label: '실행 방식', kind: 'select', options: EXECUTION_POLICY_OPTIONS },
];

export const EXECUTION_FIELDS = [
    { key: 'pollIntervalMs', label: '실행 점검 간격', kind: 'number', step: '100', min: '100', suffix: 'ms' },
    { key: 'accountRefreshIntervalMs', label: '계정 갱신 간격', kind: 'number', step: '100', min: '250', suffix: 'ms' },
    { key: 'entryAnalysisIntervalMs', label: '진입 분석 간격', kind: 'number', step: '1000', min: '1000', suffix: 'ms' },
    { key: 'orderCooldownMs', label: '주문 재시도 대기', kind: 'number', step: '100', min: '0', suffix: 'ms' },
];

const MODE_LABELS = Object.fromEntries(EXECUTION_MODE_OPTIONS.map((option) => [option.value, option.label]));

const ROUTE_LABELS = {
    EXECUTE_HERE: '이 서버가 실행 주체',
    FORWARD_TO_LEADER: '실행 서버로 전달',
    UNAVAILABLE: '실행 서버 확인 필요',
};

const RECONCILIATION_LABELS = {
    NOT_CONFIGURED: '전용 API 키 미설정',
    FLAT: '포지션 없음',
    OPEN_POSITION: '포지션 확인됨',
    PENDING_ORDERS: '미체결 주문 있음',
    UNKNOWN: '대조 확인 필요',
};

const PERCENT_KEYS = ['addStepPct', 'takeProfitPct', 'stopLossPct'];

const CONFIG_API_KEYS = {
    baseNotional: 'base-notional',
    addStepPct: 'add-step-pct',
    takeProfitPct: 'take-profit-pct',
    stopLossPct: 'stop-loss-pct',
    martingaleRatio: 'martingale-ratio',
    maxAdds: 'max-adds',
    positionMode: 'position-mode',
    priceSource: 'price-source',
};

const EXECUTION_API_KEYS = {
    pollIntervalMs: 'poll-interval-ms',
    accountRefreshIntervalMs: 'account-refresh-interval-ms',
    entryAnalysisIntervalMs: 'entry-analysis-interval-ms',
    orderCooldownMs: 'order-cooldown-ms',
};

function decimalText(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return String(Number(number.toFixed(6)));
}

export function toConfigDraft(config) {
    const draft = Object.fromEntries(Object.entries(config || {}).map(([key, value]) => [key, value == null ? '' : String(value)]));
    PERCENT_KEYS.forEach((key) => {
        if (draft[key] !== '') draft[key] = decimalText(Number(draft[key]) * 100);
    });
    return draft;
}

export function toBackendConfig(draft) {
    const updates = {};
    Object.entries(draft || {}).forEach(([key, value]) => {
        updates[CONFIG_API_KEYS[key] || key] = value;
    });
    PERCENT_KEYS.forEach((key) => {
        const apiKey = CONFIG_API_KEYS[key] || key;
        if (updates[apiKey] !== '') updates[apiKey] = decimalText(Number(updates[apiKey]) / 100);
    });
    return updates;
}

export function toBackendStrategyConfig(draft) {
    const strategyDraft = Object.fromEntries(
        Object.entries(draft || {}).filter(([key]) => key !== 'symbol')
    );
    return toBackendConfig(strategyDraft);
}

export function toBackendExecution(draft) {
    const updates = {};
    Object.entries(draft || {}).forEach(([key, value]) => {
        const apiKey = EXECUTION_API_KEYS[key] || key;
        updates[apiKey] = value;
    });
    return updates;
}

export function modeLabel(mode) {
    return MODE_LABELS[mode] || mode || '확인 중';
}

export function routeLabel(route) {
    return ROUTE_LABELS[route] || route || '확인 중';
}

export function reconciliationLabel(kind) {
    return RECONCILIATION_LABELS[kind] || kind || '확인 중';
}

export function formatNumber(value, maximumFractionDigits = 4) {
    if (value === null || value === undefined || value === '') return '-';
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(number);
}

export function formatPercent(value) {
    if (value === null || value === undefined || value === '') return '-';
    return `${formatNumber(Number(value) * 100, 3)}%`;
}

export function formatModeValue(value) {
    return value === null || value === undefined ? '' : String(value);
}

export function fixedRequestError(fallback = '자동매매 서버와 통신하지 못했습니다.') {
    return fallback;
}

export function firstPosition(reconciliation) {
    return reconciliation?.account?.positions?.[0] || null;
}
