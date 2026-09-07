// 전송 경로. 실제 돈이 나가는 곳이라 규칙이 셋 있다.
//
// 1. 회차 상태를 매 전송 직전과 직후에 storage.session 에 기록한다.
//    service worker 는 30초 유휴면 종료되므로 전역 변수에 두면 사라진다.
// 2. 실패는 확정 거부(REJECTED)와 접수 불명(UNKNOWN)을 나눈다.
//    거부는 이미 못 나갈 게 확정된 것이라 다음 회차를 계속 보낸다.
//    불명은 즉시 멈춘다 — 그대로 재전송하면 중복 주문이 된다.
// 3. 불명 회차는 재전송하지 않고 clientOrderId 로 조회해서 먼저 확정한다.

import * as api from './binance.js';

const LOCK_KEY = 'executionLock';
const LOCK_TTL_MS = 120_000;
const STATE_PREFIX = 'exec:';

const ORDER_DOES_NOT_EXIST = -2013;

export function newPlanId() {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 바이낸스 규칙: ^[.A-Z:/a-z0-9_-]{1,36}$
export function clientOrderIdFor(planId, seq) {
    const id = `scale-${planId}-${seq}`;
    if (!/^[.A-Z:/a-z0-9_-]{1,36}$/.test(id)) {
        throw new Error(`주문 식별자가 규칙에 맞지 않습니다: ${id}`);
    }
    return id;
}

async function readState(planId) {
    const stored = await chrome.storage.session.get(STATE_PREFIX + planId);
    return stored[STATE_PREFIX + planId] ?? null;
}

async function writeState(state) {
    await chrome.storage.session.set({ [STATE_PREFIX + state.planId]: state });
}

async function withLock(planId, run) {
    const stored = await chrome.storage.session.get(LOCK_KEY);
    const lock = stored[LOCK_KEY];
    if (lock && Date.now() - lock.at < LOCK_TTL_MS && lock.planId !== planId) {
        throw new Error('다른 탭에서 전송이 진행 중입니다');
    }
    await chrome.storage.session.set({ [LOCK_KEY]: { planId, at: Date.now() } });
    try {
        return await run();
    } finally {
        await chrome.storage.session.remove(LOCK_KEY);
    }
}

// 이미 만들어진 계획이면 그 상태를 그대로 돌려준다. 새로 만들면 안 된다 —
// 덮어쓰면 ACCEPTED 기록이 사라져서 이미 접수된 회차를 다시 보내게 된다.
export async function ensureState({ planId, plan, meta, mode }) {
    const existing = await readState(planId);
    if (existing) return existing;

    const state = {
        planId,
        symbol: meta.symbol,
        side: plan.side,
        positionSide: meta.positionSide,
        timeInForce: meta.timeInForce,
        mode,
        levels: plan.levels
            .filter((level) => !level.skipReason)
            .map((level) => ({
                seq: level.seq,
                price: level.price,
                quantity: level.quantity,
                clientOrderId: clientOrderIdFor(planId, level.seq),
                status: 'PENDING',
                orderId: null,
                message: null,
            })),
    };
    await writeState(state);
    return state;
}

// 접수 여부를 모르는 회차가 남아 있으면 전송을 막는다.
// 그대로 다시 보내면 중복 주문이 된다 — 조회로 확정하는 길(reconcile)만 열어 둔다.
export function unknownCount(state) {
    return state ? state.levels.filter((level) => level.status === 'UNKNOWN').length : 0;
}

function orderParams(state, level) {
    const params = {
        symbol: state.symbol,
        side: state.side === 'LONG' ? 'BUY' : 'SELL',
        type: 'LIMIT',
        timeInForce: state.timeInForce,
        quantity: level.quantity,
        price: level.price,
        newClientOrderId: level.clientOrderId,
    };
    // 양방향(Hedge) 모드에서는 positionSide 가 없으면 주문이 거부된다.
    // 단방향에서는 보내지 않는다(BOTH 가 기본값이다).
    if (state.positionSide !== 'BOTH') params.positionSide = state.positionSide;
    return params;
}

// PENDING 회차를 순서대로 보낸다. 불명이 나오면 그 자리에서 멈춘다.
export async function sendPending(planId) {
    const state = await readState(planId);
    if (!state) return { kind: 'FAILED', message: '전송할 계획을 찾을 수 없습니다' };

    if (unknownCount(state) > 0) {
        return halted(state, '접수 여부를 모르는 회차가 있습니다. 조회로 확정한 뒤 이어서 보내세요');
    }

    return withLock(planId, async () => {
        for (const level of state.levels) {
            if (level.status !== 'PENDING') continue;

            if (state.mode === 'PAPER') {
                level.status = 'ACCEPTED';
                level.message = 'PAPER — 전송하지 않았습니다';
                await writeState(state);
                continue;
            }

            level.status = 'SENDING';
            await writeState(state);

            try {
                const response = await api.placeOrder(orderParams(state, level), {
                    test: state.mode === 'TEST',
                });
                level.status = 'ACCEPTED';
                level.orderId = response.orderId ?? null;
                level.message = state.mode === 'TEST' ? 'TEST — 필터와 서명 검증 통과' : '접수됨';
            } catch (error) {
                if (error.kind === 'REJECTED') {
                    level.status = 'REJECTED';
                    level.message = error.message;
                } else if (error.kind === 'RATE_LIMIT') {
                    level.status = 'PENDING';
                    level.message = error.message;
                    await writeState(state);
                    return halted(state, '요청 한도에 걸려 멈췄습니다. 잠시 뒤 이어서 보내세요');
                } else {
                    level.status = 'UNKNOWN';
                    level.message = error.message;
                    await writeState(state);
                    return halted(state, '접수 여부를 알 수 없어 멈췄습니다. 조회로 확정한 뒤 이어서 보내세요');
                }
            }
            await writeState(state);
        }
        return { kind: 'PLACED', planId, summary: summarize(state), levels: state.levels };
    });
}

// 불명 회차를 조회로 확정한다. 절대 그대로 재전송하지 않는다.
export async function reconcile(planId) {
    const state = await readState(planId);
    if (!state) return { kind: 'FAILED', message: '확인할 계획을 찾을 수 없습니다' };

    return withLock(planId, () => reconcileLevels(state));
}

async function reconcileLevels(state) {
    for (const level of state.levels) {
        if (level.status !== 'UNKNOWN') continue;
        try {
            const order = await api.orderByClientId(state.symbol, level.clientOrderId);
            level.status = 'ACCEPTED';
            level.orderId = order.orderId ?? null;
            level.message = `조회로 확인됨 (${order.status})`;
        } catch (error) {
            if (error.kind === 'REJECTED' && error.code === ORDER_DOES_NOT_EXIST) {
                level.status = 'PENDING';
                level.message = '접수되지 않았습니다. 다시 보낼 수 있습니다';
            } else {
                level.message = `조회 실패: ${error.message}`;
            }
        }
        await writeState(state);
    }

    const stillUnknown = unknownCount(state);
    return {
        kind: 'RECONCILED',
        planId: state.planId,
        stillUnknown,
        summary: summarize(state),
        levels: state.levels,
    };
}

export async function readExecution(planId) {
    return readState(planId);
}

function halted(state, reason) {
    return { kind: 'HALTED', planId: state.planId, reason, summary: summarize(state), levels: state.levels };
}

function summarize(state) {
    const count = (status) => state.levels.filter((l) => l.status === status).length;
    return {
        total: state.levels.length,
        accepted: count('ACCEPTED'),
        rejected: count('REJECTED'),
        unknown: count('UNKNOWN'),
        pending: count('PENDING'),
    };
}
