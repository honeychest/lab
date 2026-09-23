import * as D from './decimal.js';

const OPEN_STATUSES = new Set(['NEW', 'PARTIALLY_FILLED']);
const ACTIVE_STATES = new Set(['ARMED', 'TRIGGERED', 'CHASING']);
const DECIMAL_ORDER_FIELDS = new Set(['price', 'origQty', 'executedQty']);
const STREAM_BASE = 'wss://fstream.binance.com';
const ORDER_FIELDS = ['orderId', 'symbol', 'side', 'positionSide', 'type', 'timeInForce', 'reduceOnly', 'price', 'origQty', 'executedQty', 'status'];
const STOP_CANCELLED_REASON = '전체 정지 뒤 취소됨';

function decimal(value) {
    return D.fromString(value);
}

export function cancelledForGeneration(requestedGeneration, currentGeneration) {
    if (requestedGeneration === currentGeneration) return null;
    return { kind: 'CANCELLED', reason: STOP_CANCELLED_REASON };
}

export function createSerialQueue() {
    let tail = Promise.resolve();
    return (task) => {
        const run = tail.then(task, task);
        tail = run.catch(() => {});
        return run;
    };
}

function decimalText(value) {
    const raw = D.format(value, D.SCALE);
    if (!raw.includes('.')) return raw;
    return raw.replace(/0+$/, '').replace(/\.$/, '');
}

function decimalAbs(value) {
    const parsed = decimal(value);
    return parsed < 0n ? -parsed : parsed;
}

function decimalEqual(a, b) {
    try {
        return decimal(a) === decimal(b);
    } catch {
        return a === b;
    }
}

function orderChanges(expected, actual) {
    return ORDER_FIELDS.filter((field) => {
        if (DECIMAL_ORDER_FIELDS.has(field)) return !decimalEqual(expected?.[field], actual?.[field]);
        if (field === 'orderId') return String(expected?.[field]) !== String(actual?.[field]);
        return expected?.[field] !== actual?.[field];
    });
}

function copyWatch(watch) {
    return {
        ...watch,
        known: watch?.known ? { ...watch.known } : watch?.known,
        position: watch?.position ? { ...watch.position } : watch?.position,
        triggers: watch?.triggers ? {
            ...watch.triggers,
            price: watch.triggers.price ? { ...watch.triggers.price } : watch.triggers.price,
            pnl: watch.triggers.pnl ? { ...watch.triggers.pnl } : watch.triggers.pnl,
        } : watch?.triggers,
        modifyTimes: [...(watch?.modifyTimes || [])],
        expectedAmendments: [...(watch?.expectedAmendments || [])].map((item) => ({ ...item })),
    };
}

function activeWatch(watch) {
    return ACTIVE_STATES.has(watch?.state);
}

function closeReason(watch, reason, effects = ['NOTIFY']) {
    watch.state = 'DISARMED';
    watch.reason = reason;
    delete watch.positionReconcilePending;
    delete watch.pausedAt;
    delete watch.gapStartedAt;
    delete watch.gapEndedAt;
    return effects;
}

function pauseReason(watch, reason, now) {
    if (activeWatch(watch)) watch.pausedFrom = watch.state;
    watch.state = 'PAUSED';
    watch.reason = reason;
    if (Number.isFinite(now)) watch.pausedAt = now;
    return ['NOTIFY'];
}

function amendmentMatches(amendment, orderId, modifyId) {
    return String(amendment?.orderId) === String(orderId) && String(amendment?.modifyId) === String(modifyId);
}

function positionMatches(watchPosition, position) {
    if (!watchPosition) return true;
    if (!samePositionIdentity(watchPosition, position)) return false;
    return decimalEqual(watchPosition.expectedSizeAbs ?? watchPosition.sizeAbs, position.sizeAbs);
}

function samePositionIdentity(watchPosition, position) {
    if (!watchPosition || !position) return !watchPosition && !position;
    return watchPosition.positionSide === position.positionSide
        && watchPosition.direction === position.direction
        && decimalEqual(watchPosition.entryPrice, position.entryPrice);
}

function orderSnapshot(known, order) {
    return {
        ...known,
        ...order,
        price: order?.price ?? order?.p ?? known?.price,
        executedQty: order?.executedQty ?? order?.z ?? known?.executedQty,
        status: order?.status ?? order?.X ?? known?.status,
    };
}

export function isCloseOrder(order) {
    if (order?.positionSide === 'LONG') return order.side === 'SELL';
    if (order?.positionSide === 'SHORT') return order.side === 'BUY';
    if (order?.positionSide === 'BOTH') return order.reduceOnly === true;
    return false;
}

export function pickPosition(positions, symbol, positionSide) {
    const list = Array.isArray(positions) ? positions : [];
    const found = list.find((item) => {
        if (item?.symbol !== symbol) return false;
        if (positionSide !== 'BOTH') return item?.positionSide === positionSide;
        try {
            return decimal(item?.positionAmt) !== 0n;
        } catch {
            return false;
        }
    });
    if (!found) return null;

    let amount;
    try {
        amount = decimal(found.positionAmt);
    } catch {
        return null;
    }
    if (amount === 0n) return null;
    const direction = positionSide === 'LONG'
        ? 'LONG'
        : positionSide === 'SHORT'
            ? 'SHORT'
            : amount > 0n ? 'LONG' : 'SHORT';
    return {
        positionSide: found.positionSide ?? positionSide,
        direction,
        sizeAbs: decimalText(amount < 0n ? -amount : amount),
        entryPrice: String(found.entryPrice),
    };
}

function normalizePosition(position) {
    if (!position) return position;
    return {
        ...position,
        symbol: position.symbol ?? position.s,
        positionSide: position.positionSide ?? position.ps,
        positionAmt: position.positionAmt ?? position.pa,
        entryPrice: position.entryPrice ?? position.ep,
    };
}

export function accountPositionOf(positions, symbol, positionSide) {
    const list = Array.isArray(positions) ? positions.map(normalizePosition) : [];
    const matched = list.some((position) => position?.symbol === symbol
        && (positionSide === undefined || position?.positionSide === positionSide));
    if (!matched) return { present: false, position: undefined };
    return { present: true, position: pickPosition(list, symbol, positionSide) };
}

export function pnlAt(position, price) {
    const delta = decimal(price) - decimal(position.entryPrice);
    const value = D.mul(delta, decimal(position.sizeAbs));
    return position.direction === 'LONG' ? value : -value;
}

export function directionFor(current, target) {
    const a = decimal(current);
    const b = decimal(target);
    if (a < b) return 'UP';
    if (a > b) return 'DOWN';
    return null;
}

export function hitTarget(value, target, dir) {
    const a = decimal(value);
    const b = decimal(target);
    if (dir === 'UP') return a >= b;
    if (dir === 'DOWN') return a <= b;
    return false;
}

function activeWatches(existingWatches) {
    return (Array.isArray(existingWatches) ? existingWatches : []).filter((watch) => !['DONE', 'DISARMED'].includes(watch?.state));
}

export function canArm({ order, triggers, position, current, existingWatches = [], limits = {} }) {
    if (order?.type !== 'LIMIT') return { ok: false, reason: 'LIMIT 주문만 감시할 수 있습니다' };
    if (!OPEN_STATUSES.has(order?.status)) return { ok: false, reason: '미체결 또는 부분 체결 주문만 감시할 수 있습니다' };
    try {
        if (!(decimal(order.origQty) > decimal(order.executedQty))) return { ok: false, reason: '남은 수량이 없습니다' };
    } catch {
        return { ok: false, reason: '주문 수량을 읽을 수 없습니다' };
    }

    const requested = triggers || {};
    const keys = ['price', 'pnl'].filter((key) => requested[key] !== undefined && requested[key] !== null);
    if (!keys.length) return { ok: false, reason: '조건이 없습니다' };
    const isClose = isCloseOrder(order);
    if (requested.pnl !== undefined && !isClose) return { ok: false, reason: '손익 조건은 청산 주문만 허용됩니다' };
    if (requested.pnl !== undefined && !position) return { ok: false, reason: '손익 조건에 포지션이 없습니다' };

    const preparedTriggers = {};
    try {
        if (requested.price !== undefined) {
            if (!['LAST', 'MARK'].includes(requested.price.ref) || !(decimal(requested.price.target) > 0n)) {
                return { ok: false, reason: '가격 조건이 올바르지 않습니다' };
            }
            const currentValue = current?.[requested.price.ref];
            const dir = directionFor(currentValue, requested.price.target);
            if (!dir) return { ok: false, reason: '이미 닿음 — 지금 Chase' };
            preparedTriggers.price = { ...requested.price, dir };
        }
        if (requested.pnl !== undefined) {
            const target = decimal(requested.pnl.target);
            const currentPnl = pnlAt(position, current?.LAST);
            const dir = directionFor(currentPnl, target);
            if (!dir) return { ok: false, reason: '이미 닿음 — 지금 Chase' };
            preparedTriggers.pnl = { ...requested.pnl, dir };
        }
    } catch {
        return { ok: false, reason: '조건 값을 읽을 수 없습니다' };
    }

    const watches = activeWatches(existingWatches);
    if (watches.some((watch) => String(watch.orderId) === String(order.orderId))) {
        return { ok: false, reason: '이미 감시 중인 주문입니다' };
    }
    const maxSymbols = limits.maxSymbols ?? 10;
    const maxOrders = limits.maxOrders ?? 30;
    const symbols = new Set(watches.map((watch) => watch.symbol));
    if (!symbols.has(order.symbol) && symbols.size >= maxSymbols) return { ok: false, reason: '감시 심볼 상한에 도달했습니다' };
    if (watches.length >= maxOrders) return { ok: false, reason: '감시 주문 상한에 도달했습니다' };

    const preparedPosition = position
        ? { ...position, expectedSizeAbs: position.sizeAbs }
        : undefined;
    return {
        ok: true,
        reason: null,
        prepared: {
            symbol: order.symbol,
            orderId: String(order.orderId),
            positionSide: order.positionSide,
            side: order.side,
            known: { ...order },
            isClose,
            triggers: preparedTriggers,
            ...(preparedPosition ? { position: preparedPosition } : {}),
            state: 'ARMED',
            modifyCount: 0,
            modifyTimes: [],
            expectedAmendments: [],
        },
    };
}

export function evaluateTrigger(watch, prices) {
    const conditions = [];
    if (watch?.triggers?.price) {
        const value = prices?.[watch.triggers.price.ref];
        if (value !== undefined && hitTarget(value, watch.triggers.price.target, watch.triggers.price.dir)) conditions.push('price');
    }
    if (watch?.triggers?.pnl && watch.position && prices?.LAST !== undefined) {
        if (hitTarget(pnlAt(watch.position, prices.LAST), watch.triggers.pnl.target, watch.triggers.pnl.dir)) conditions.push('pnl');
    }
    return { fired: conditions.length > 0, conditions };
}

export function transition(watch, event, now) {
    const next = copyWatch(watch);
    const effects = [];
    const type = event?.type;
    if (['DONE', 'DISARMED'].includes(next.state)) return { watch: next, effects };
    if (Number.isFinite(now)) {
        next.expectedAmendments = next.expectedAmendments.filter((item) => now - item.sentAt <= 60_000);
    }

    if (type === 'PRICE' && next.state === 'ARMED') {
        const result = evaluateTrigger(next, event.prices);
        if (result.fired) {
            next.state = 'TRIGGERED';
            next.triggeredAt = now;
            next.reason = `${result.conditions.join(',')} 조건 발동`;
            effects.push('NOTIFY', 'REFETCH');
        }
        return { watch: next, effects };
    }
    if (type === 'LOCK_ACQUIRED') return { watch: next, effects: next.state === 'TRIGGERED' ? ['REFETCH'] : effects };
    if (next.state === 'PAUSED' && ['ORDER_REFETCHED', 'ACCOUNT_POSITION', 'POSITION_REFETCHED'].includes(type)) {
        return { watch: next, effects };
    }
    if (type === 'ORDER_REFETCHED') {
        const order = event.order;
        const orderId = order?.orderId ?? order?.i;
        const confirmed = String(orderId) === String(next.orderId)
            && order?.price !== undefined
            && decimalEqual(order.price, next.known?.price);
        if (confirmed) {
            next.expectedAmendments = next.expectedAmendments.filter((item) => (
                String(item.orderId) !== String(next.orderId)
            ));
        }
        if (orderChanges(next.known, order).length) closeReason(next, '주문이 바뀌었습니다');
        return { watch: next, effects };
    }
    if (type === 'MODIFY_SENT') {
        if (!['TRIGGERED', 'CHASING'].includes(next.state)) return { watch: next, effects };
        next.expectedAmendments.push({ orderId: next.orderId, modifyId: event.modifyId, sentAt: now });
        return { watch: next, effects };
    }
    if (type === 'MODIFY_OK') {
        const response = event.response || {};
        if (next.state === 'PAUSED') {
            next.known = orderSnapshot(next.known, response);
            return { watch: next, effects };
        }
        if (!['TRIGGERED', 'CHASING'].includes(next.state)) return { watch: next, effects };
        next.known = orderSnapshot(next.known, response);
        next.modifyCount = (next.modifyCount || 0) + 1;
        next.modifyTimes.push(now);
        next.modifyTimes = next.modifyTimes.filter((time) => now - time < 60_000);
        next.state = 'CHASING';
        next.reason = null;
        return { watch: next, effects };
    }
    if (type === 'MODIFY_REJECTED') {
        if (!['TRIGGERED', 'CHASING'].includes(next.state)) return { watch: next, effects };
        next.expectedAmendments = next.expectedAmendments.filter((item) => String(item.modifyId) !== String(event.modifyId));
        pauseReason(next, `수정 거부: ${event.msg}`, now);
        return { watch: next, effects: ['NOTIFY'] };
    }
    if (type === 'MODIFY_UNKNOWN') {
        if (!['TRIGGERED', 'CHASING'].includes(next.state)) return { watch: next, effects };
        pauseReason(next, '수정 결과 불명', now);
        return { watch: next, effects: ['NOTIFY'] };
    }
    if (type === 'ORDER_EVENT') {
        const orderEvent = event.o || {};
        if (String(orderEvent.i) !== String(next.orderId)) return { watch: next, effects };
        if (orderEvent.x === 'AMENDMENT') {
            const modifyId = orderEvent.M;
            const matched = modifyId !== undefined && next.expectedAmendments.some((item) => amendmentMatches(item, orderEvent.i, modifyId));
            if (!matched) {
                closeReason(next, '외부 수정');
                return { watch: next, effects: ['NOTIFY'] };
            }
            next.expectedAmendments = next.expectedAmendments.filter((item) => !amendmentMatches(item, orderEvent.i, modifyId));
            next.known = orderSnapshot(next.known, orderEvent);
        }
        if (orderEvent.x === 'TRADE') {
            const previous = decimal(next.known.executedQty ?? '0');
            const cumulative = decimal(orderEvent.z ?? orderEvent.executedQty ?? next.known.executedQty ?? '0');
            const delta = cumulative > previous ? cumulative - previous : 0n;
            if (delta > 0n) {
                next.known.executedQty = orderEvent.z ?? orderEvent.executedQty ?? next.known.executedQty;
                next.known.status = orderEvent.X ?? next.known.status;
                if (next.position) {
                    const expected = decimal(next.position.expectedSizeAbs ?? next.position.sizeAbs);
                    next.position.expectedSizeAbs = decimalText(expected > delta ? expected - delta : 0n);
                }
            }
        }
        if (['CANCELED', 'EXPIRED'].includes(orderEvent.X)) {
            closeReason(next, '주문이 취소됨');
            effects.push('NOTIFY');
        } else if (orderEvent.X === 'FILLED') {
            next.state = 'DONE';
            next.reason = null;
            delete next.positionReconcilePending;
            effects.push('NOTIFY', 'REMOVE');
        }
        return { watch: next, effects };
    }
    if (type === 'ACCOUNT_POSITION' || type === 'POSITION_REFETCHED') {
        const position = event.position;
        if (!position || decimalEqual(position.sizeAbs, '0')) {
            closeReason(next, '포지션 없음');
        } else if (positionMatches(next.position, position)) {
            delete next.positionReconcilePending;
        } else if (!next.positionReconcilePending) {
            let explainable = false;
            try {
                if (samePositionIdentity(next.position, position)) {
                    const expected = decimal(next.position.expectedSizeAbs ?? next.position.sizeAbs);
                    const size = decimal(position.sizeAbs);
                    const remaining = decimal(next.known.origQty) - decimal(next.known.executedQty ?? '0');
                    const lowerBound = expected - remaining;
                    explainable = size > 0n && size < expected && size >= lowerBound;
                }
            } catch {
                explainable = false;
            }
            if (explainable) {
                next.positionReconcilePending = true;
                effects.push('REFETCH');
            } else {
                closeReason(next, '포지션이 바뀌었습니다');
            }
        } else {
            closeReason(next, '포지션이 바뀌었습니다');
        }
        return { watch: next, effects };
    }
    if (type === 'POLL_FAILED') {
        if (activeWatch(next)) pauseReason(next, event.reason || '조회 실패', now);
        return { watch: next, effects: next.state === 'PAUSED' ? ['NOTIFY'] : effects };
    }
    if (['GAP', 'WORKER_RESTART', 'RATE_LIMIT_NEAR', 'STOP_ALL'].includes(type)) {
        if (next.state === 'PAUSED') return { watch: next, effects };
        const reasons = {
            GAP: '공백',
            WORKER_RESTART: '확장 재시작',
            RATE_LIMIT_NEAR: '요청 한도 임박',
            STOP_ALL: '전체 정지',
        };
        if (activeWatch(next)) {
            pauseReason(next, reasons[type], now);
            if (type === 'GAP') {
                next.gapStartedAt = event.gapStartedAt ?? now;
                next.gapEndedAt = event.gapEndedAt ?? now;
            }
        }
        return { watch: next, effects: next.state === 'PAUSED' ? ['NOTIFY'] : effects };
    }
    if (type === 'RESUME_CHECKED') {
        if (next.state !== 'PAUSED') return { watch: next, effects };
        const orderSame = orderChanges(next.known, event.order).length === 0;
        const positionSame = positionMatches(next.position, event.position);
        if (!orderSame || !positionSame) closeReason(next, '재개 전 상태가 바뀌었습니다');
        else {
            next.state = next.triggeredAt !== undefined ? 'TRIGGERED' : 'ARMED';
            delete next.pausedFrom;
            delete next.pausedAt;
            delete next.gapStartedAt;
            delete next.gapEndedAt;
            next.reason = null;
            delete next.positionReconcilePending;
        }
        return { watch: next, effects };
    }
    if (type === 'DISARM') {
        closeReason(next, event.reason || '사용자 해제');
        return { watch: next, effects };
    }
    return { watch: next, effects };
}

export function shouldModify(watch, bestSameSide, now, settings = {}) {
    if (watch?.state !== 'CHASING' || bestSameSide === null || bestSameSide === undefined) return false;
    try {
        const parsed = decimal(bestSameSide);
        if (parsed !== parsed || !Number.isFinite(Number(bestSameSide))) return false;
    } catch {
        return false;
    }
    if (decimalEqual(bestSameSide, watch.known?.price)) return false;
    if ((watch.expectedAmendments || []).some((item) => String(item.orderId) === String(watch.orderId) && now - item.sentAt <= 60_000)) return false;
    const minIntervalMs = settings.minIntervalMs ?? 0;
    const maxPerMinute = settings.maxPerMinute ?? Infinity;
    const times = (watch.modifyTimes || []).filter((time) => now - time < 60_000);
    const last = times.length ? times[times.length - 1] : null;
    if (last !== null && now - last < minIntervalMs) return false;
    return times.length < maxPerMinute;
}

export function gapDetected(lastTickAt, now, gapMs) {
    return now - lastTickAt > gapMs;
}

export function gapWindow(lastTickAt, now, gapMs) {
    if (!lastTickAt || !gapDetected(lastTickAt, now, gapMs)) return null;
    return { gapStartedAt: lastTickAt, gapEndedAt: now };
}

export function streamStale(lastEventAt, now, staleMs) {
    return now - lastEventAt > staleMs;
}

export function workerBarrier(storedInstanceId, currentInstanceId) {
    return storedInstanceId !== currentInstanceId;
}

export function reachedConditionsDuringGap(klines, trigger, position) {
    const bars = Array.isArray(klines) ? klines : [];
    const priceTrigger = trigger?.price || (trigger?.ref ? trigger : null);
    const pnlTrigger = trigger?.pnl || (trigger?.kind === 'pnl' ? trigger : null);
    const conditions = new Set();
    for (const bar of bars) {
        const high = bar?.high ?? bar?.h ?? bar?.[2];
        const low = bar?.low ?? bar?.l ?? bar?.[3];
        if (high === undefined || low === undefined) continue;
        if (priceTrigger && hitTarget(priceTrigger.dir === 'UP' ? high : low, priceTrigger.target, priceTrigger.dir)) conditions.add('price');
        if (pnlTrigger && position) {
            const highPnl = pnlAt(position, high);
            const lowPnl = pnlAt(position, low);
            const upper = highPnl > lowPnl ? highPnl : lowPnl;
            const lower = highPnl < lowPnl ? highPnl : lowPnl;
            const target = decimal(pnlTrigger.target);
            if (pnlTrigger.dir === 'UP' ? upper >= target : lower <= target) conditions.add('pnl');
        }
    }
    return [...conditions];
}

export function reachedDuringGap(klines, trigger, position) {
    if (reachedConditionsDuringGap(klines, trigger, position).length) return true;
    return false;
}

export function summarizeForResume(watch, order, position, prices) {
    const changes = orderChanges(watch?.known, order);
    if (watch?.position && !positionMatches(watch.position, position)) {
        if (!decimalEqual(watch.position.entryPrice, position?.entryPrice)) changes.push('position.entryPrice');
        if (watch.position.direction !== position?.direction) changes.push('position.direction');
        if (!decimalEqual(watch.position.expectedSizeAbs ?? watch.position.sizeAbs, position?.sizeAbs)) changes.push('position.sizeAbs');
    }
    return {
        unchanged: changes.length === 0,
        changes: [...new Set(changes)],
        firesImmediately: evaluateTrigger(watch, prices).fired,
    };
}

function valueFrom(source, key) {
    if (source instanceof Map) return source.get(key);
    return source?.[key];
}

export function priceSnapshotFor(watch, tickers = {}, marks = {}) {
    const prices = {};
    const required = new Set();
    if (watch?.triggers?.price?.ref) required.add(watch.triggers.price.ref);
    if (watch?.triggers?.pnl) required.add('LAST');
    if (required.has('LAST')) prices.LAST = valueFrom(tickers, watch.symbol);
    if (required.has('MARK')) prices.MARK = valueFrom(marks, watch.symbol);
    if ([...required].some((key) => prices[key] === undefined || prices[key] === null || prices[key] === '')) return null;
    return prices;
}

export function restOrderEvent(order) {
    const status = order?.status ?? order?.X;
    if (!['FILLED', 'CANCELED', 'EXPIRED'].includes(status)) return null;
    return {
        type: 'ORDER_EVENT',
        o: {
            ...order,
            orderId: String(order.orderId ?? order.i),
            i: String(order.orderId ?? order.i),
            X: status,
            x: 'REST',
        },
    };
}

export function pollFailureEvent(error) {
    if (error?.kind === 'RATE_LIMIT') return { type: 'RATE_LIMIT_NEAR' };
    return { type: 'POLL_FAILED', reason: `조회 실패: ${error?.message || '알 수 없는 오류'}` };
}

export function streamUrl(connection, streams = [], listenKey = null) {
    const kind = String(connection).toLowerCase();
    if (kind === 'private') {
        if (!listenKey) return null;
        return `${STREAM_BASE}/private/ws?listenKey=${encodeURIComponent(listenKey)}&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE`;
    }
    const names = (Array.isArray(streams) ? streams : [])
        .filter(Boolean)
        .map((stream) => {
            const value = String(stream);
            const at = value.indexOf('@');
            return at < 0 ? value.toLowerCase() : `${value.slice(0, at).toLowerCase()}${value.slice(at)}`;
        });
    if (!names.length) return null;
    if (!['market', 'public'].includes(kind)) throw new Error(`알 수 없는 스트림 연결입니다: ${connection}`);
    return `${STREAM_BASE}/${kind}/stream?streams=${names.join('/')}`;
}

export const buildStreamUrl = streamUrl;

export function subscriptionDiff(previous = [], next = []) {
    const before = new Set(previous);
    const after = new Set(next);
    return {
        subscribe: [...after].filter((item) => !before.has(item)),
        unsubscribe: [...before].filter((item) => !after.has(item)),
    };
}

export const diffSubscriptions = subscriptionDiff;

export function usageNearLimit(value = {}, limits = {}) {
    return Number(value.used1m ?? value.weight1m ?? 0) >= (limits.used1m ?? 1800)
        || Number(value.orderCount10s ?? value.orders10s ?? 0) >= (limits.orderCount10s ?? 240)
        || Number(value.orderCount1m ?? value.orders1m ?? 0) >= (limits.orderCount1m ?? 960);
}

export const rateLimitNear = usageNearLimit;

export function reconnectDelay(attempt, maxMs = 30_000) {
    const safeAttempt = Math.max(0, Number(attempt) || 0);
    return Math.min(maxMs, 1_000 * (2 ** safeAttempt));
}

export function restNeeds(watches = [], connectionStates = {}) {
    const list = Array.isArray(watches) ? watches.filter((watch) => !['DONE', 'DISARMED'].includes(watch?.state)) : [];
    const needs = {
        positionRisk: list.some((watch) => watch?.triggers?.pnl),
        premiumIndex: list.some((watch) => watch?.triggers?.price?.ref === 'MARK'),
        tickerPrice: list.some((watch) => watch?.triggers?.price?.ref === 'LAST' || watch?.triggers?.pnl),
        bookTicker: list.filter((watch) => watch?.state === 'CHASING').map((watch) => watch.symbol),
        orders: [...new Set(list.map((watch) => watch.symbol))],
    };
    if (connectionStates.market === 'LIVE') {
        needs.premiumIndex = false;
        needs.tickerPrice = false;
    }
    if (connectionStates.public === 'LIVE') needs.bookTicker = [];
    if (connectionStates.private === 'LIVE') needs.positionRisk = false;
    return needs;
}

export const requiredRest = restNeeds;
