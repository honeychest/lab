import * as api from './binance.js';
import { operationLock } from './execution.js';
import { MutexBusyError } from '../core/mutex.js';
import {
    accountPositionOf,
    canArm,
    cancelledForGeneration,
    createSerialQueue,
    gapWindow,
    pickPosition,
    pollFailureEvent,
    priceSnapshotFor,
    reachedConditionsDuringGap,
    restOrderEvent,
    restNeeds,
    shouldModify,
    summarizeForResume,
    transition,
    usageNearLimit,
} from '../core/watch.js';
import { chaseParamsOf, classifyModifyResponse, createModifyIdGenerator } from '../core/chase.js';
import { createStreamController } from './stream.js';

const WATCH_PREFIX = 'watch:';
const META_KEY = 'watchMeta';
const SETTINGS_KEY = 'chaseSettings';
const DEFAULT_SETTINGS = Object.freeze({ minIntervalMs: 1000, maxPerMinute: 20, restIntervalMs: 3000, gapMs: 60_000 });
const SETTINGS_MINIMUMS = Object.freeze({ minIntervalMs: 200, maxPerMinute: 1, restIntervalMs: 1000, gapMs: 15000 });
const SETTINGS_LABELS = Object.freeze({
    minIntervalMs: '수정 최소 간격',
    maxPerMinute: '분당 최대 수정',
    restIntervalMs: '조회 감시 간격',
    gapMs: '공백 기준',
});
const activeStates = new Set(['ARMED', 'TRIGGERED', 'CHASING']);

const watches = new Map();
const prices = new Map();
const books = new Map();
const notifyOnce = new Set();
const watchStorageQueues = new Map();
let meta = null;
let settings = { ...DEFAULT_SETTINGS };
let modifyIdGenerator = createModifyIdGenerator();
let polling = false;
let lastRestAt = 0;
let queue = Promise.resolve();
let tickTimer = null;
let alarmListenerInstalled = false;
let readyPromise = null;
let stopGeneration = 0;

function workerId() {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function idFor(watch) {
    return String(watch.id);
}

async function writeMeta() {
    meta.modifyIdGen = modifyIdGenerator.snapshot();
    await chrome.storage.session.set({ [META_KEY]: { ...meta, connection: { ...meta.connection } } });
}

function generationChanged(generation) {
    return generation !== null && generation !== stopGeneration;
}

function storageQueueFor(id) {
    let run = watchStorageQueues.get(String(id));
    if (!run) {
        run = createSerialQueue();
        watchStorageQueues.set(String(id), run);
    }
    return run;
}

async function saveWatch(watch, { generation = stopGeneration } = {}) {
    const id = idFor(watch);
    if (generationChanged(generation)) {
        await pauseAfterStop(id);
        return false;
    }
    watches.set(id, watch);
    const stored = await storageQueueFor(id)(async () => {
        if (generationChanged(generation)) return false;
        await chrome.storage.session.set({ [WATCH_PREFIX + watch.id]: watch });
        return true;
    });
    await updateBadge();
    if (generationChanged(generation)) {
        await pauseAfterStop(id);
        return false;
    }
    return stored;
}

async function deleteWatch(id) {
    const key = String(id);
    watches.delete(key);
    await storageQueueFor(key)(() => chrome.storage.session.remove(WATCH_PREFIX + id));
    await updateBadge();
}

async function notify(watch, reason) {
    const key = `${watch?.id ?? 'all'}:${reason}`;
    if (notifyOnce.has(key)) return;
    notifyOnce.add(key);
    await chrome.notifications.create(`watch-${key}`, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: 'Chase 감시',
        message: watch ? `${watch.symbol} 주문 ${watch.orderId}: ${reason}` : reason,
    }).catch(() => {});
}

async function updateBadge() {
    const count = [...watches.values()].filter((watch) => ['PAUSED', 'DISARMED'].includes(watch.state)).length;
    await chrome.action.setBadgeText({ text: count ? String(count) : '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
}

function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
}

async function applyEffects(watch, effects, { persist = true, generation = stopGeneration } = {}) {
    if (effects.includes('NOTIFY')) await notify(watch, watch.reason || '상태가 바뀌었습니다');
    if (effects.includes('REMOVE')) {
        await notify(watch, '주문이 체결되어 감시를 종료했습니다');
        await deleteWatch(watch.id);
        return true;
    }
    if (persist && !await saveWatch(watch, { generation })) return false;
    if (effects.includes('REFETCH')) scheduleTriggered(watch.id);
    return true;
}

function watchChanged(before, after) {
    return JSON.stringify(before) !== JSON.stringify(after);
}

function streamStateChanged(before, after) {
    return before?.state !== after?.state
        && [before?.state, after?.state].some((state) => ['TRIGGERED', 'CHASING'].includes(state));
}

async function pauseAfterStop(id) {
    const current = watches.get(String(id));
    if (!current || !activeStates.has(current.state)) return current;
    const result = transition(current, { type: 'STOP_ALL' }, Date.now());
    if (!watchChanged(current, result.watch)) return result.watch;
    watches.set(idFor(result.watch), result.watch);
    await applyEffects(result.watch, result.effects, { generation: null });
    return result.watch;
}

async function applyEvent(id, event, now = Date.now(), { generation = stopGeneration } = {}) {
    const current = watches.get(String(id));
    if (!current) return null;
    const result = transition(current, event, now);
    if (watchChanged(current, result.watch)) watches.set(idFor(result.watch), result.watch);
    await applyEffects(result.watch, result.effects, { persist: watchChanged(current, result.watch), generation });
    if (streamStateChanged(current, result.watch)) await refreshStreams();
    return result.watch;
}

async function applyUrgentEvent(id, event, { refresh = true } = {}) {
    const current = watches.get(String(id));
    if (!current) return null;
    const result = transition(current, event, Date.now());
    if (watchChanged(current, result.watch)) watches.set(idFor(result.watch), result.watch);
    await applyEffects(result.watch, result.effects, { persist: watchChanged(current, result.watch) });
    if (refresh && streamStateChanged(current, result.watch)) await refreshStreams();
    return result.watch;
}

function scheduleTriggered(id, delay = 0) {
    setTimeout(() => enqueue(() => runTriggered(id)), delay);
}

async function runTriggered(id) {
    const current = watches.get(String(id));
    if (!current || current.state !== 'TRIGGERED') return;
    try {
        await operationLock.run('watch', async () => {
            const locked = watches.get(String(id));
            if (!locked || locked.state !== 'TRIGGERED') return;
            await applyEvent(id, { type: 'LOCK_ACQUIRED' });
            const order = await api.orderById(locked.symbol, String(locked.orderId));
            let position = locked.position;
            if (locked.triggers?.pnl) {
                position = pickPosition(await api.positionRiskFresh(), locked.symbol, locked.positionSide);
            }
            await applyEvent(id, restOrderEvent(order) || { type: 'ORDER_REFETCHED', order });
            if (locked.triggers?.pnl) await applyEvent(id, { type: 'POSITION_REFETCHED', position });
            const refreshed = watches.get(String(id));
            if (!refreshed || refreshed.state !== 'TRIGGERED') return;
            const modifyId = modifyIdGenerator.next(Date.now());
            await writeMeta();
            const params = chaseParamsOf(order, modifyId);
            if (!params.ok) {
                await applyEvent(id, { type: 'MODIFY_REJECTED', msg: params.reason });
                return;
            }
            await applyEvent(id, { type: 'MODIFY_SENT', modifyId });
            try {
                const response = await api.modifyOrder(params.params);
                const classified = classifyModifyResponse(params.params, response);
                if (classified.kind === 'MISMATCH') await applyEvent(id, { type: 'MODIFY_UNKNOWN' });
                else await applyEvent(id, { type: 'MODIFY_OK', response });
            } catch (error) {
                await applyEvent(id, error?.kind === 'REJECTED'
                    ? { type: 'MODIFY_REJECTED', msg: error.message }
                    : { type: 'MODIFY_UNKNOWN' });
            }
        });
    } catch (error) {
        if (error instanceof MutexBusyError) {
            if (current.triggeredAt && Date.now() - current.triggeredAt > 30_000) await notify(current, '분할 전송 때문에 추격 대기 중');
            scheduleTriggered(id, 500);
        } else {
            await applyEvent(id, { type: 'MODIFY_UNKNOWN' });
        }
    }
}

async function sendChaseModification(id, bestPrice) {
    const current = watches.get(String(id));
    if (!current || !shouldModify(current, bestPrice, Date.now(), settings)) return;
    try {
        await operationLock.run('watch', async () => {
            const watch = watches.get(String(id));
            if (!watch || !shouldModify(watch, bestPrice, Date.now(), settings)) return;
            const modifyId = modifyIdGenerator.next(Date.now());
            await writeMeta();
            const params = chaseParamsOf(watch.known, modifyId);
            if (!params.ok) return;
            await applyEvent(id, { type: 'MODIFY_SENT', modifyId });
            try {
                const response = await api.modifyOrder(params.params);
                const classified = classifyModifyResponse(params.params, response);
                await applyEvent(id, classified.kind === 'MISMATCH'
                    ? { type: 'MODIFY_UNKNOWN' }
                    : { type: 'MODIFY_OK', response });
            } catch (error) {
                await applyEvent(id, error?.kind === 'REJECTED'
                    ? { type: 'MODIFY_REJECTED', msg: error.message }
                    : { type: 'MODIFY_UNKNOWN' });
            }
        });
    } catch (error) {
        if (!(error instanceof MutexBusyError)) await applyEvent(id, { type: 'MODIFY_UNKNOWN' });
    }
}

function priceEvent(symbol, update) {
    return ensureReady().then(() => {
    const current = prices.get(symbol) || {};
    const next = { ...current, ...update };
    prices.set(symbol, next);
    meta.lastMarketEventAt = Date.now();
    for (const watch of watches.values()) {
        if (watch.symbol !== symbol || !activeStates.has(watch.state)) continue;
        enqueue(async () => {
            const changed = await applyEvent(watch.id, { type: 'PRICE', prices: next });
            if (changed?.state === 'TRIGGERED') scheduleTriggered(changed.id);
        });
    }
    }).catch(() => {});
}

function bookEvent(symbol, book) {
    return ensureReady().then(() => {
    books.set(symbol, book);
    for (const watch of watches.values()) {
        if (watch.symbol !== symbol || watch.state !== 'CHASING') continue;
        const best = watch.side === 'BUY' ? book.bid : book.ask;
        enqueue(() => sendChaseModification(watch.id, best));
    }
    }).catch(() => {});
}

function orderEvent(order) {
    return ensureReady().then(() => {
    meta.lastUserEventAt = Date.now();
    for (const watch of watches.values()) {
        if (String(watch.orderId) !== String(order?.i)) continue;
        enqueue(() => applyEvent(watch.id, { type: 'ORDER_EVENT', o: order }));
    }
    }).catch(() => {});
}

function accountEvent(positions) {
    return ensureReady().then(() => {
    meta.lastUserEventAt = Date.now();
    for (const watch of watches.values()) {
        if (!watch.position) continue;
        const result = accountPositionOf(positions, watch.symbol, watch.positionSide);
        if (!result.present) continue;
        enqueue(() => applyEvent(watch.id, { type: 'ACCOUNT_POSITION', position: result.position }));
    }
    }).catch(() => {});
}

const stream = createStreamController({
    onPrice: priceEvent,
    onBook: bookEvent,
    onOrder: orderEvent,
    onAccount: accountEvent,
    onState: (name, state) => {
        ensureReady().then(() => enqueue(() => {
            if (meta) meta.connection[name] = state;
        })).catch(() => {});
    },
    onReconnect: reconcileAfterReconnect,
    onReconnectFailed: reconcileFailure,
});

async function refreshStreams() {
    const list = [...watches.values()].filter((watch) => activeStates.has(watch.state));
    const market = new Set();
    const publicStreams = new Set();
    for (const watch of list) {
        if (watch.triggers?.price?.ref === 'LAST' || watch.triggers?.pnl) market.add(`${watch.symbol}@aggTrade`);
        if (watch.triggers?.price?.ref === 'MARK') market.add(`${watch.symbol}@markPrice@1s`);
        if (['TRIGGERED', 'CHASING'].includes(watch.state)) publicStreams.add(`${watch.symbol}@bookTicker`);
    }
    await stream.update({ market: [...market], public: [...publicStreams], private: list.length > 0 });
}

function normalizeTicker(list, key) {
    const values = Array.isArray(list) ? list : list ? [list] : [];
    return new Map(values.filter((item) => item?.symbol).map((item) => [item.symbol, item[key]]));
}

function settled(promise) {
    return promise.then((value) => ({ value })).catch((error) => ({ error }));
}

async function pollRest({ force = false, full = false } = {}) {
    const active = [...watches.values()].filter((watch) => activeStates.has(watch.state));
    if (!active.length || (!force && Date.now() - lastRestAt < settings.restIntervalMs)) return;
    while (polling) await new Promise((resolve) => setTimeout(resolve, 10));
    const states = Object.fromEntries(Object.entries(meta.connection).map(([name, value]) => [name, value.state]));
    const needs = full ? {
        positionRisk: true,
        premiumIndex: true,
        tickerPrice: true,
        bookTicker: [...new Set(active.filter((watch) => watch.state === 'CHASING').map((watch) => watch.symbol))],
        orders: [...new Set(active.map((watch) => watch.symbol))],
    } : restNeeds(active, states);
    if (!Object.values(needs).some((value) => Array.isArray(value) ? value.length : value)) return;
    polling = true;
    lastRestAt = Date.now();
    try {
        const [positionsResult, marksResult, tickersResult] = await Promise.all([
            needs.positionRisk ? settled(api.positionRiskFresh()) : { value: null },
            needs.premiumIndex ? settled(api.premiumIndexAll()) : { value: null },
            needs.tickerPrice ? settled(api.tickerPriceAll()) : { value: null },
        ]);
        const positions = positionsResult.error ? null : positionsResult.value;
        const marks = marksResult.error ? null : marksResult.value;
        const tickers = tickersResult.error ? null : tickersResult.value;
        const markMap = normalizeTicker(marks, 'markPrice');
        const tickerMap = normalizeTicker(tickers, 'price');
        const openBySymbol = new Map();
        const orderResults = await Promise.all(needs.orders.map(async (symbol) => [symbol, await settled(api.openOrders(symbol))]));
        for (const [symbol, result] of orderResults) openBySymbol.set(symbol, result);
        const bookResults = new Map();
        for (const symbol of needs.bookTicker) {
            bookResults.set(symbol, await settled(api.bookTicker(symbol)));
        }
        for (const watch of active) {
            if (needs.tickerPrice && (watch.triggers?.price?.ref === 'LAST' || watch.triggers?.pnl)
                && tickersResult.error) {
                await applyEvent(watch.id, pollFailureEvent(tickersResult.error));
            } else if (needs.premiumIndex && watch.triggers?.price?.ref === 'MARK' && marksResult.error) {
                await applyEvent(watch.id, pollFailureEvent(marksResult.error));
            } else {
                const current = priceSnapshotFor(watch, tickerMap, markMap);
                if (current && Object.keys(current).length) {
                    prices.set(watch.symbol, current);
                    await applyEvent(watch.id, { type: 'PRICE', prices: current });
                } else if (full && (watch.triggers?.price || watch.triggers?.pnl)) {
                    await applyEvent(watch.id, { type: 'POLL_FAILED', reason: '조회 실패: 대상 심볼 가격 없음' });
                }
            }
            const orderResult = openBySymbol.get(watch.symbol);
            if (orderResult?.error) {
                await applyEvent(watch.id, pollFailureEvent(orderResult.error));
            } else {
                try {
                    const orderList = Array.isArray(orderResult?.value) ? orderResult.value : [];
                    const order = orderList.find((item) => String(item.orderId) === String(watch.orderId))
                        || await api.orderById(watch.symbol, String(watch.orderId));
                    await applyEvent(watch.id, restOrderEvent(order) || { type: 'ORDER_REFETCHED', order });
                } catch (error) {
                    await applyEvent(watch.id, pollFailureEvent(error));
                }
            }
            if (watch.position && needs.positionRisk) {
                if (positionsResult.error) await applyEvent(watch.id, pollFailureEvent(positionsResult.error));
                else await applyEvent(watch.id, { type: 'POSITION_REFETCHED', position: pickPosition(positions, watch.symbol, watch.positionSide) });
            }
            const bookResult = bookResults.get(watch.symbol);
            if (watch.state === 'CHASING' && needs.bookTicker.includes(watch.symbol)) {
                if (bookResult?.error) await applyEvent(watch.id, pollFailureEvent(bookResult.error));
                else if (bookResult?.value) bookEvent(watch.symbol, { bid: bookResult.value.bidPrice, ask: bookResult.value.askPrice });
            }
        }
    } finally {
        polling = false;
    }
}

async function reconcileAfterReconnect() {
    await ensureReady();
    return enqueue(() => pollRest({ force: true, full: true }));
}

async function reconcileFailure(name, error) {
    await ensureReady();
    const reason = `재연결 대조 실패(${name}): ${error?.message || '알 수 없는 오류'} — 재개 필요`;
    return enqueue(async () => {
        for (const watch of [...watches.values()]) {
            if (activeStates.has(watch.state)) await applyEvent(watch.id, { type: 'POLL_FAILED', reason });
        }
    });
}

async function tick() {
    const now = Date.now();
    const gap = gapWindow(meta.lastTickAt, now, settings.gapMs);
    if (gap) {
        for (const watch of [...watches.values()]) await applyEvent(watch.id, { type: 'GAP', ...gap }, now);
    }
    meta.lastTickAt = now;
    for (const watch of watches.values()) if (watch.state === 'TRIGGERED') scheduleTriggered(watch.id);
    await pollRest();
    const usage = api.usage();
    meta.usage = usage;
    if (usageNearLimit(usage)) for (const watch of [...watches.values()]) await applyEvent(watch.id, { type: 'RATE_LIMIT_NEAR' });
    await writeMeta();
}

async function initialize() {
    const stored = await chrome.storage.session.get(null);
    const storedMeta = stored[META_KEY] || {};
    meta = {
        workerInstanceId: workerId(),
        lastTickAt: storedMeta.lastTickAt ?? null,
        lastMarketEventAt: storedMeta.lastMarketEventAt ?? null,
        lastUserEventAt: storedMeta.lastUserEventAt ?? null,
        connection: storedMeta.connection || { market: { state: 'DOWN' }, public: { state: 'DOWN' }, private: { state: 'DOWN' } },
        modifyIdGen: storedMeta.modifyIdGen || {},
        usage: storedMeta.usage || api.usage(),
    };
    modifyIdGenerator = createModifyIdGenerator(meta.modifyIdGen);
    const local = await chrome.storage.local.get(SETTINGS_KEY);
    settings = { ...DEFAULT_SETTINGS, ...(local[SETTINGS_KEY] || {}) };
    for (const [key, value] of Object.entries(stored)) {
        if (!key.startsWith(WATCH_PREFIX) || !value) continue;
        watches.set(key.slice(WATCH_PREFIX.length), value);
    }
    if (storedMeta.workerInstanceId && storedMeta.workerInstanceId !== meta.workerInstanceId) {
        for (const watch of [...watches.values()]) {
            if (!activeStates.has(watch.state)) continue;
            await applyEvent(watch.id, { type: 'WORKER_RESTART' });
        }
    }
    await writeMeta();
    await refreshStreams();
    if (!tickTimer) tickTimer = setInterval(() => enqueue(tick), 5_000);
    if (!alarmListenerInstalled && chrome.alarms?.onAlarm) {
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'chase-watch-tick') ensureReady().then(() => enqueue(tick)).catch(() => {});
        });
        chrome.alarms.create('chase-watch-tick', { periodInMinutes: 0.5 });
        alarmListenerInstalled = true;
    }
}

async function recordInitializationFailure(error) {
    const message = `확장 초기화 실패: ${error?.message || '알 수 없는 오류'}`;
    const paused = [];
    for (const watch of [...watches.values()]) {
        if (!activeStates.has(watch.state)) continue;
        const result = transition(watch, { type: 'POLL_FAILED', reason: message }, Date.now());
        watches.set(idFor(result.watch), result.watch);
        paused.push(result.watch);
    }
    await Promise.all(paused.map(async (watch) => {
        try { await chrome.storage.session.set({ [WATCH_PREFIX + watch.id]: watch }); } catch { /* 재시도 때 다시 기록한다. */ }
    }));
    try {
        const stored = await chrome.storage.session.get(META_KEY);
        const storedMeta = stored[META_KEY] || {};
        await chrome.storage.session.set({ [META_KEY]: { ...storedMeta, initialization: { state: 'FAILED', message } } });
    } catch { /* 응답의 FAILED 메시지로 원인을 보존한다. */ }
}

export function ensureReady() {
    if (readyPromise) return readyPromise;
    const attempt = initialize();
    readyPromise = attempt.catch(async (error) => {
        await recordInitializationFailure(error);
        readyPromise = null;
        throw error;
    });
    readyPromise.catch(() => {});
    return readyPromise;
}

export let ready = ensureReady();

export async function listWatches() {
    await ensureReady();
    return {
        watches: [...watches.values()].map((watch) => ({
            ...watch,
            summary: { state: watch.state, reason: watch.reason || null, modifyCount: watch.modifyCount || 0 },
        })),
        connection: meta.connection,
        settings: { ...settings },
    };
}

export async function armWatch(input) {
    const armedAtGeneration = stopGeneration;
    await ensureReady();
    return enqueue(async () => {
        const preparedInput = typeof input === 'function' ? await input() : input;
        if (preparedInput?.kind === 'REJECTED') return preparedInput;
        if (armedAtGeneration !== stopGeneration) return { kind: 'REJECTED', reason: '전체 정지로 감시를 켜지 않았습니다' };
        const existingWatches = [...watches.values()];
        const result = canArm({ ...preparedInput, existingWatches });
        if (!result.ok) return { kind: 'REJECTED', reason: result.reason };
        const watch = {
            id: `${result.prepared.symbol}-${result.prepared.orderId}-${Date.now()}`,
            ...result.prepared,
            createdAt: Date.now(),
        };
        if (armedAtGeneration !== stopGeneration) return { kind: 'REJECTED', reason: '전체 정지로 감시를 켜지 않았습니다' };
        if (generationChanged(armedAtGeneration)) return { kind: 'REJECTED', reason: '전체 정지로 감시를 켜지 않았습니다' };
        if (!await saveWatch(watch, { generation: armedAtGeneration })) {
            return { kind: 'REJECTED', reason: '전체 정지로 감시를 켜지 않았습니다' };
        }
        if (generationChanged(armedAtGeneration)) {
            await pauseAfterStop(watch.id);
            return { kind: 'REJECTED', reason: '전체 정지로 감시를 켜지 않았습니다' };
        }
        await refreshStreams();
        if (generationChanged(armedAtGeneration)) {
            await pauseAfterStop(watch.id);
            return { kind: 'REJECTED', reason: '전체 정지로 감시를 켜지 않았습니다' };
        }
        return { kind: 'ARMED', watch };
    });
}

export async function disarmWatch(id) {
    await ensureReady();
    const watch = await applyUrgentEvent(id, { type: 'DISARM', reason: '사용자 해제' }, { refresh: false });
    await refreshStreams();
    return { kind: 'DISARMED', watch };
}

export async function stopAll() {
    stopGeneration += 1;
    await ensureReady();
    const results = [];
    for (const watch of [...watches.values()]) {
        const current = watches.get(String(watch.id));
        if (!current) continue;
        const result = transition(current, { type: 'STOP_ALL' }, Date.now());
        if (!watchChanged(current, result.watch)) continue;
        watches.set(idFor(result.watch), result.watch);
        results.push(result);
    }
    await Promise.all(results.map((result) => applyEffects(result.watch, result.effects, { generation: null })));
    await refreshStreams();
    return listWatches();
}

export async function refresh() {
    await ensureReady();
    return enqueue(async () => {
        for (const watch of [...watches.values()]) if (watch.state === 'DISARMED') await deleteWatch(watch.id);
        await refreshStreams();
        return listWatches();
    });
}

async function resumeOne(watch, requestedGeneration) {
    const cancelled = cancelledForGeneration(requestedGeneration, stopGeneration);
    if (cancelled) return cancelled;
    const order = await api.orderById(watch.symbol, String(watch.orderId));
    if (cancelledForGeneration(requestedGeneration, stopGeneration)) return cancelledForGeneration(requestedGeneration, stopGeneration);
    const terminalOrder = restOrderEvent(order);
    if (terminalOrder) return applyEvent(watch.id, terminalOrder, Date.now(), { generation: requestedGeneration });
    const position = watch.position ? pickPosition(await api.positionRiskFresh(), watch.symbol, watch.positionSide) : undefined;
    const afterPosition = cancelledForGeneration(requestedGeneration, stopGeneration);
    if (afterPosition) return afterPosition;
    const result = transition(watch, { type: 'RESUME_CHECKED', order, position }, Date.now());
    if (!await applyEffects(result.watch, result.effects, { generation: requestedGeneration })) {
        return cancelledForGeneration(requestedGeneration, stopGeneration) || result.watch;
    }
    return result.watch;
}

export async function resumePreview(ids = 'all') {
    await ensureReady();
    const selected = ids === 'all' ? [...watches.values()] : [...watches.values()].filter((watch) => ids.includes(watch.id));
    const previews = [];
    for (const watch of selected.filter((item) => item.state === 'PAUSED')) {
        try {
            const order = await api.orderById(watch.symbol, String(watch.orderId));
            const position = watch.position ? pickPosition(await api.positionRiskFresh(), watch.symbol, watch.positionSide) : undefined;
            const pricesNow = prices.get(watch.symbol) || {};
            const start = Math.max(0, watch.gapStartedAt || watch.pausedAt || meta.lastTickAt || Date.now() - settings.gapMs);
            const end = Math.max(start, watch.gapEndedAt || Date.now());
            const priceTrigger = watch.triggers?.price;
            const pnlTrigger = watch.triggers?.pnl;
            const lastBars = priceTrigger?.ref === 'LAST' || pnlTrigger
                ? await api.klines(watch.symbol, start, end)
                : null;
            const markBars = priceTrigger?.ref === 'MARK'
                ? await api.markPriceKlines(watch.symbol, start, end)
                : null;
            const reachedConditions = [
                ...(priceTrigger ? reachedConditionsDuringGap(priceTrigger.ref === 'MARK' ? markBars : lastBars, { price: priceTrigger }, position) : []),
                ...(pnlTrigger ? reachedConditionsDuringGap(lastBars, { pnl: pnlTrigger }, position) : []),
            ];
            const uniqueReachedConditions = [...new Set(reachedConditions)];
            previews.push({
                id: watch.id,
                ...summarizeForResume(watch, order, position, pricesNow),
                reachedDuringGap: uniqueReachedConditions.length > 0,
                reachedConditions: uniqueReachedConditions,
            });
        } catch (error) {
            previews.push({ id: watch.id, error: error.message });
        }
    }
    return { kind: 'RESUME_PREVIEW', previews };
}

export async function resume(ids = 'all') {
    const requestedGeneration = stopGeneration;
    await ensureReady();
    return enqueue(async () => {
        const initialCancellation = cancelledForGeneration(requestedGeneration, stopGeneration);
        if (initialCancellation) return initialCancellation;
        const selected = ids === 'all' ? [...watches.values()] : [...watches.values()].filter((watch) => ids.includes(watch.id));
        for (const watch of selected.filter((item) => item.state === 'PAUSED')) {
            const beforeWatch = cancelledForGeneration(requestedGeneration, stopGeneration);
            if (beforeWatch) return beforeWatch;
            try {
                const result = await resumeOne(watch, requestedGeneration);
                if (result?.kind === 'CANCELLED') return result;
            } catch (error) {
                const failedDuringStop = cancelledForGeneration(requestedGeneration, stopGeneration);
                if (failedDuringStop) return failedDuringStop;
                await applyEvent(watch.id, pollFailureEvent(error), Date.now(), { generation: requestedGeneration });
            }
        }
        const beforeRefresh = cancelledForGeneration(requestedGeneration, stopGeneration);
        if (beforeRefresh) return beforeRefresh;
        await refreshStreams();
        const afterRefresh = cancelledForGeneration(requestedGeneration, stopGeneration);
        if (afterRefresh) return afterRefresh;
        return listWatches();
    });
}

export async function getSettings() {
    await ensureReady();
    return { ...settings };
}

export async function setSettings(next) {
    await ensureReady();
    return enqueue(async () => {
        for (const [key, minimum] of Object.entries(SETTINGS_MINIMUMS)) {
            if (next?.[key] === undefined) continue;
            if (!Number.isInteger(next[key]) || next[key] < minimum) {
                return { kind: 'INVALID', reason: `${SETTINGS_LABELS[key]}: ${minimum} 이상의 양의 정수만 입력하세요` };
            }
        }
        settings = { ...settings, ...next };
        await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
        return { ...settings };
    });
}
