// 메시지 라우팅. content script 는 여기에 요청만 보내고 키는 절대 받지 않는다.

import * as api from './binance.js';
import * as exec from './execution.js';
import {
    buildPlan,
    canonicalOf,
    digestOf,
    MULTIPLIER_MIN,
    MULTIPLIER_MAX,
    MULTIPLIER_STEP,
    LEVEL_MIN,
    LEVEL_MAX,
    RANGE_MAX,
} from '../core/plan.js';
import { toSymbolRules, checkPercentPrice } from '../core/filters.js';
import { hasCredentials, saveCredentials, clearCredentials } from './keys.js';

const PLAN_PREFIX = 'plan:';
const PLAN_TTL_MS = 5 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handle(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ kind: 'FAILED', message: error.message }));
    return true; // 비동기 응답을 끝까지 유지한다.
});

async function handle(message) {
    switch (message?.kind) {
        case 'LIMITS':
            // 경계값의 원본은 core/plan.js 하나뿐이다. 화면이 따로 갖지 않는다.
            return {
                kind: 'LIMITS',
                multiplierMin: MULTIPLIER_MIN,
                multiplierMax: MULTIPLIER_MAX,
                multiplierStep: Number(MULTIPLIER_STEP),
                levelMin: LEVEL_MIN,
                levelMax: LEVEL_MAX,
                rangeMax: RANGE_MAX,
            };
        case 'KEY_STATUS':
            return (await hasCredentials()) ? { kind: 'READY' } : { kind: 'NEED_KEY' };
        case 'SAVE_KEY':
            await saveCredentials(message.apiKey, message.secretKey);
            return { kind: 'READY' };
        case 'OPEN_OPTIONS':
            await chrome.runtime.openOptionsPage();
            return { kind: 'OPENED' };
        case 'CLEAR_KEY':
            await clearCredentials();
            return { kind: 'NEED_KEY' };
        case 'PRICE':
            return currentPrice(message.symbol);
        case 'PREVIEW':
            return preview(message.input);
        case 'PLACE':
            return place(message.planId, message.digest, message.mode);
        case 'RESUME':
            return resume(message.planId);
        case 'ACCOUNT':
            return account(message.symbol);
        case 'CANCEL_ALL':
            return cancelAll(message.symbol);
        default:
            return { kind: 'FAILED', message: `알 수 없는 요청입니다: ${message?.kind}` };
    }
}

// 기준가 자동 입력용. 공개 호가라 키가 없어도 된다.
async function currentPrice(symbol) {
    const book = await api.bookTicker(symbol);
    return { kind: 'PRICE', symbol, bid: book.bidPrice, ask: book.askPrice };
}

// 계획을 만든다. 심볼 규칙과 호가는 매번 새로 읽는다.
async function computePlan(input) {
    const info = await api.symbolInfo(input.symbol);
    const rules = toSymbolRules(info);
    const plan = buildPlan(input, rules);
    if (!plan.ok) return { plan, rules };

    // 지정가를 쌓으려던 게 즉시 체결되는 것을 막는다.
    // ticker/price 는 최근 체결가라 호가가 아니므로 bookTicker 를 쓴다.
    const book = await api.bookTicker(input.symbol).catch(() => null);
    if (book) {
        const ask = Number(book.askPrice);
        const bid = Number(book.bidPrice);
        for (const level of plan.levels) {
            if (level.skipReason) continue;
            const price = Number(level.price);
            const crosses = input.side === 'LONG' ? price >= ask : price <= bid;
            if (crosses) level.skipReason = '즉시체결(호가교차)';
        }
    }

    // PERCENT_PRICE 는 마크가 기준이라 별도로 본다.
    const mark = await api.markPrice(input.symbol).catch(() => null);
    if (mark?.markPrice) {
        for (const level of plan.levels) {
            if (level.skipReason) continue;
            const reason = checkPercentPrice(level.price, mark.markPrice, rules, input.side);
            if (reason) level.skipReason = reason;
        }
    }

    recount(plan);
    return { plan, rules };
}

// 즉시체결·PERCENT_PRICE 로 제외가 늘어났으면 합계를 다시 센다.
function recount(plan) {
    const sendable = plan.levels.filter((l) => !l.skipReason);
    plan.totals.sendCount = sendable.length;
    plan.totals.skipCount = plan.levels.length - sendable.length;
    if (plan.totals.skipCount > 0 && !plan.warnings.some((w) => w.includes('제외'))) {
        plan.warnings.push(`${plan.totals.skipCount}건이 제외됩니다`);
    }
}

async function positionMetaOf(symbol, side) {
    if (!(await hasCredentials())) {
        return { needKey: true, positionSide: 'BOTH', mode: null, leverage: null };
    }
    const mode = await api.positionMode();
    const positionSide = mode === 'HEDGE' ? (side === 'LONG' ? 'LONG' : 'SHORT') : 'BOTH';
    let leverage = null;
    try {
        const risks = await api.positionRisk(symbol);
        leverage = Array.isArray(risks) && risks.length ? risks[0].leverage : null;
    } catch {
        leverage = null;
    }
    return { needKey: false, positionSide, mode, leverage };
}

async function preview(input) {
    const { plan } = await computePlan(input);
    if (!plan.ok) return { kind: 'INVALID', reasons: plan.reasons };

    const position = await positionMetaOf(input.symbol, input.side);
    const meta = {
        symbol: input.symbol,
        positionSide: position.positionSide,
        timeInForce: 'GTC',
    };
    const digest = await digestOf(canonicalOf(plan, meta));
    const planId = exec.newPlanId();

    await chrome.storage.session.set({
        [PLAN_PREFIX + planId]: { input, meta, digest, at: Date.now() },
    });

    if (position.mode === 'ONE_WAY') {
        plan.warnings.push('단방향 모드입니다 — 반대 포지션이 있으면 이 주문이 그 포지션을 줄입니다');
    }

    return {
        kind: 'PLAN',
        planId,
        digest,
        levels: plan.levels,
        totals: plan.totals,
        warnings: plan.warnings,
        positionMode: position.mode,
        positionSide: position.positionSide,
        leverage: position.leverage,
        needKey: position.needKey,
    };
}

async function place(planId, digest, mode) {
    const stored = await chrome.storage.session.get(PLAN_PREFIX + planId);
    const saved = stored[PLAN_PREFIX + planId];
    if (!saved) return { kind: 'STALE', message: '미리보기가 만료됐습니다. 다시 계산해 주세요' };
    if (Date.now() - saved.at > PLAN_TTL_MS) {
        return { kind: 'STALE', message: '미리보기가 만료됐습니다. 다시 계산해 주세요' };
    }
    if (saved.digest !== digest) {
        return { kind: 'STALE', message: '화면의 표와 저장된 계획이 다릅니다. 다시 계산해 주세요' };
    }

    // 전송 직전 재검증. 호가·필터·포지션 모드가 그 사이 바뀌었을 수 있다.
    const { plan } = await computePlan(saved.input);
    if (!plan.ok) return { kind: 'INVALID', reasons: plan.reasons };

    const position = await positionMetaOf(saved.input.symbol, saved.input.side);
    if (position.needKey) return { kind: 'NEED_KEY' };

    const meta = { symbol: saved.input.symbol, positionSide: position.positionSide, timeInForce: 'GTC' };
    const fresh = await digestOf(canonicalOf(plan, meta));
    if (fresh !== digest) {
        return {
            kind: 'STALE',
            message: '조건이 바뀌어 주문 내용이 달라졌습니다. 새 표를 확인해 주세요',
            levels: plan.levels,
            totals: plan.totals,
            warnings: plan.warnings,
        };
    }
    if (!plan.totals.sendCount) {
        return { kind: 'INVALID', reasons: ['전송할 회차가 없습니다'] };
    }

    // 이미 전송을 시작한 계획이면 상태를 새로 만들지 않는다.
    // 덮어쓰면 접수된 회차가 PENDING 으로 되돌아가 중복 주문이 된다.
    await exec.ensureState({ planId, plan, meta, mode });
    return exec.sendPending(planId);
}

async function resume(planId) {
    const reconciled = await exec.reconcile(planId);
    if (reconciled.kind === 'FAILED') return reconciled;
    if (reconciled.stillUnknown > 0) {
        return { ...reconciled, kind: 'HALTED', reason: '아직 확정하지 못한 회차가 있습니다' };
    }
    return exec.sendPending(planId);
}

async function account(symbol) {
    if (!(await hasCredentials())) return { kind: 'NEED_KEY' };
    const [accountInfo, orders, position] = await Promise.all([
        api.futuresAccount(),
        api.openOrders(symbol),
        positionMetaOf(symbol, 'LONG'),
    ]);
    const usdt = (accountInfo.assets || []).find((a) => a.asset === 'USDT');
    return {
        kind: 'ACCOUNT',
        availableBalance: usdt?.availableBalance ?? '0',
        walletBalance: usdt?.walletBalance ?? '0',
        positionMode: position.mode,
        leverage: position.leverage,
        openOrders: (orders || []).map((o) => ({
            orderId: o.orderId,
            clientOrderId: o.clientOrderId,
            side: o.side,
            positionSide: o.positionSide,
            price: o.price,
            quantity: o.origQty,
            status: o.status,
        })),
    };
}

async function cancelAll(symbol) {
    if (!(await hasCredentials())) return { kind: 'NEED_KEY' };
    const before = (await api.openOrders(symbol)) || [];
    await api.cancelAllOpenOrders(symbol);
    const after = (await api.openOrders(symbol)) || [];
    // 응답에 취소 건수가 없어서 전후 조회로 센다. 그 사이 체결이 있으면
    // 숫자가 정확하지 않을 수 있어 "확인된 개수" 로 표시한다.
    return { kind: 'CANCELLED', before: before.length, after: after.length };
}
