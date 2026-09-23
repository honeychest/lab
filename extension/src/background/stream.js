import * as api from './binance.js';
import { JsonFormatError, parseWebsocketJsonWithStringIds } from './binance.js';
import { reconnectDelay, streamUrl, subscriptionDiff } from '../core/watch.js';

const CONNECTIONS = ['market', 'public', 'private'];
const STALE_MS = { market: 5_000, public: 5_000, private: 30_000 };
const RECONCILE_BUFFER_LIMIT = 1000;

function emptyState() {
    return { state: 'DOWN', lastEventAt: null, reconnectAttempt: 0 };
}

export function createStreamController(callbacks = {}) {
    const sockets = new Map();
    const states = new Map(CONNECTIONS.map((name) => [name, emptyState()]));
    const wanted = { market: [], public: [], private: false };
    const reconnectTimers = new Map();
    const reconciliations = new Map();
    let listenKey = null;
    let listenKeyCreatedAt = 0;
    let listenKeyRenewedAt = 0;
    let keepaliveTimer = null;
    let rotateTimer = null;
    let sequence = 0;

    const emitState = (name, state) => {
        const previous = states.get(name) || emptyState();
        const next = { ...previous, state };
        states.set(name, next);
        callbacks.onState?.(name, { ...next });
    };

    const markEvent = (name) => {
        const next = { ...states.get(name), lastEventAt: Date.now() };
        states.set(name, next);
        callbacks.onState?.(name, { ...next });
    };

    const clearReconnect = (name) => {
        const timer = reconnectTimers.get(name);
        if (timer !== undefined) clearTimeout(timer);
        reconnectTimers.delete(name);
    };

    const close = (name) => {
        clearReconnect(name);
        reconciliations.delete(name);
        const socket = sockets.get(name);
        sockets.delete(name);
        if (socket && socket.readyState <= 1) socket.close();
        emitState(name, 'DOWN');
    };

    const scheduleReconnect = (name) => {
        if ((name === 'market' && !wanted.market.length)
            || (name === 'public' && !wanted.public.length)
            || (name === 'private' && !wanted.private)) return;
        const current = states.get(name) || emptyState();
        const attempt = current.reconnectAttempt + 1;
        states.set(name, { ...current, state: 'REST_FALLBACK', reconnectAttempt: attempt });
        callbacks.onState?.(name, { ...states.get(name) });
        clearReconnect(name);
        reconnectTimers.set(name, setTimeout(() => connect(name), reconnectDelay(attempt - 1)));
    };

    const parseMessage = (name, message) => {
        const envelope = message?.data && message?.stream ? message.data : message;
        if (!envelope) return;
        if (envelope.e === 'listenKeyExpired' || envelope.code === -1125) {
            recreatePrivate();
            return;
        }
        if (name === 'market') {
            if (envelope.e === 'aggTrade') callbacks.onPrice?.(envelope.s, { LAST: envelope.p });
            if (envelope.e === 'markPriceUpdate') callbacks.onPrice?.(envelope.s, { MARK: envelope.p });
        } else if (name === 'public' && envelope.e === 'bookTicker') {
            callbacks.onBook?.(envelope.s, { bid: envelope.b, ask: envelope.a });
        } else if (name === 'private') {
            if (envelope.e === 'ORDER_TRADE_UPDATE') callbacks.onOrder?.(envelope.o);
            if (envelope.e === 'ACCOUNT_UPDATE') callbacks.onAccount?.(envelope.a?.P || []);
        }
    };

    const onSocketClose = (name, socket) => {
        if (socket && sockets.get(name) !== socket) return;
        reconciliations.delete(name);
        sockets.delete(name);
        emitState(name, 'REST_FALLBACK');
        scheduleReconnect(name);
    };

    const connect = async (name) => {
        const existing = sockets.get(name);
        if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return;
        clearReconnect(name);
        if (name === 'private' && !listenKey) {
            try {
                const response = await api.listenKeyCreate();
                listenKey = response.listenKey;
                listenKeyCreatedAt = Date.now();
                listenKeyRenewedAt = listenKeyCreatedAt;
            } catch {
                emitState(name, 'REST_FALLBACK');
                scheduleReconnect(name);
                return;
            }
        }
        const url = streamUrl(name, name === 'market' ? wanted.market : wanted.public, listenKey);
        if (!url || typeof WebSocket === 'undefined') {
            close(name);
            return;
        }
        let socket;
        try {
            socket = new WebSocket(url);
        } catch {
            scheduleReconnect(name);
            return;
        }
        sockets.set(name, socket);
        socket.onopen = () => {
            const current = states.get(name) || emptyState();
            states.set(name, { ...current, state: 'RECONCILING', lastEventAt: Date.now(), reconnectAttempt: 0 });
            callbacks.onState?.(name, { ...states.get(name) });
            const reconciliation = { socket, events: [], overflow: false };
            reconciliations.set(name, reconciliation);
            const subscriptions = name === 'market' ? wanted.market : name === 'public' ? wanted.public : [];
            if (subscriptions.length) socket.send(JSON.stringify({ method: 'SUBSCRIBE', params: subscriptions, id: ++sequence }));
            Promise.resolve(callbacks.onReconnect?.(name)).then(() => {
                if (sockets.get(name) !== socket) return;
                if (reconciliation.overflow) throw new Error(`재연결 이벤트 버퍼가 ${RECONCILE_BUFFER_LIMIT}개를 초과했습니다`);
                for (const event of reconciliation.events) parseMessage(name, event);
                reconciliations.delete(name);
                const next = { ...states.get(name), state: 'LIVE' };
                states.set(name, next);
                callbacks.onState?.(name, { ...next });
            }).catch(async (error) => {
                reconciliations.delete(name);
                try { await callbacks.onReconnectFailed?.(name, error); }
                finally { onSocketClose(name, socket); }
            });
        };
        socket.onmessage = (event) => {
            markEvent(name);
            try {
                const parsed = JSON.parse(parseWebsocketJsonWithStringIds(event.data));
                const reconciliation = reconciliations.get(name);
                if (reconciliation?.socket === socket && states.get(name)?.state === 'RECONCILING') {
                    if (reconciliation.events.length >= RECONCILE_BUFFER_LIMIT) reconciliation.overflow = true;
                    else reconciliation.events.push(parsed);
                    return;
                }
                parseMessage(name, parsed);
            } catch (error) {
                if (error instanceof JsonFormatError) emitState(name, 'WARNING');
                /* malformed events are ignored */
            }
        };
        socket.onerror = () => onSocketClose(name, socket);
        socket.onclose = () => onSocketClose(name, socket);
    };

    const updateConnection = (name, nextSubscriptions) => {
        const next = [...new Set(nextSubscriptions || [])];
        const previous = name === 'market' ? wanted.market : wanted.public;
        const diff = subscriptionDiff(previous, next);
        if (name === 'market') wanted.market = next;
        else wanted.public = next;
        const socket = sockets.get(name);
        if (socket?.readyState === WebSocket.OPEN) {
            if (diff.unsubscribe.length) socket.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: diff.unsubscribe, id: ++sequence }));
            if (diff.subscribe.length) socket.send(JSON.stringify({ method: 'SUBSCRIBE', params: diff.subscribe, id: ++sequence }));
        }
        if (!next.length) close(name);
        else if (!socket || socket.readyState > WebSocket.OPEN) connect(name);
    };

    const recreatePrivate = async () => {
        close('private');
        listenKey = null;
        listenKeyCreatedAt = 0;
        listenKeyRenewedAt = 0;
        if (wanted.private) await connect('private');
    };

    const startTimers = () => {
        if (!keepaliveTimer) {
            keepaliveTimer = setInterval(() => {
                const socket = sockets.get('market');
                if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ method: 'LIST_SUBSCRIPTIONS', id: ++sequence }));
                if (listenKey && Date.now() - listenKeyRenewedAt >= 30 * 60 * 1000) {
                    api.listenKeyKeepalive().then((response) => {
                        listenKey = response.listenKey || listenKey;
                        listenKeyRenewedAt = Date.now();
                    }).catch((error) => {
                        if (error.code === -1125) recreatePrivate();
                    });
                }
                for (const name of CONNECTIONS) {
                    const state = states.get(name);
                    if (state.state === 'LIVE' && state.lastEventAt && Date.now() - state.lastEventAt > STALE_MS[name]) {
                        close(name);
                        scheduleReconnect(name);
                    }
                }
            }, 20_000);
        }
        if (!rotateTimer) {
            rotateTimer = setInterval(() => {
                if (listenKey && Date.now() - listenKeyCreatedAt >= 23 * 60 * 60 * 1000 + 50 * 60 * 1000) recreatePrivate();
            }, 60_000);
        }
    };

    return {
        async update(requirements = {}) {
            wanted.private = requirements.private !== false;
            updateConnection('market', requirements.market || []);
            updateConnection('public', requirements.public || []);
            if (wanted.private) await connect('private');
            else close('private');
            startTimers();
        },
        async keepalive() {
            if (listenKey) {
                try {
                    const response = await api.listenKeyKeepalive();
                    listenKey = response.listenKey || listenKey;
                    listenKeyRenewedAt = Date.now();
                } catch (error) {
                    if (error.code === -1125) await recreatePrivate();
                    else throw error;
                }
            }
        },
        stop() {
            for (const name of CONNECTIONS) close(name);
            if (keepaliveTimer) clearInterval(keepaliveTimer);
            if (rotateTimer) clearInterval(rotateTimer);
            keepaliveTimer = null;
            rotateTimer = null;
            listenKey = null;
            listenKeyCreatedAt = 0;
            listenKeyRenewedAt = 0;
        },
        states() {
            return Object.fromEntries([...states].map(([name, state]) => [name, { ...state }]));
        },
    };
}

export const createStreamManager = createStreamController;
