import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/core/decimal.js';
import {
    accountPositionOf,
    canArm,
    buildStreamUrl,
    cancelledForGeneration,
    createSerialQueue,
    directionFor,
    diffSubscriptions,
    evaluateTrigger,
    gapDetected,
    gapWindow,
    hitTarget,
    isCloseOrder,
    pickPosition,
    pollFailureEvent,
    priceSnapshotFor,
    pnlAt,
    rateLimitNear,
    reachedConditionsDuringGap,
    reachedDuringGap,
    reconnectDelay,
    restOrderEvent,
    requiredRest,
    shouldModify,
    streamStale,
    summarizeForResume,
    transition,
    usageNearLimit,
    workerBarrier,
} from '../src/core/watch.js';

const order = {
    orderId: 7,
    symbol: 'BTCUSDT',
    side: 'BUY',
    positionSide: 'BOTH',
    type: 'LIMIT',
    timeInForce: 'GTC',
    reduceOnly: true,
    price: '60000',
    origQty: '2',
    executedQty: '0',
    status: 'NEW',
};

const longPosition = {
    positionSide: 'BOTH',
    direction: 'LONG',
    sizeAbs: '2',
    entryPrice: '60000',
};

function armed(overrides = {}) {
    const result = canArm({
        order,
        triggers: { price: { ref: 'LAST', target: '61000' }, pnl: { target: '1000' } },
        position: longPosition,
        current: { LAST: '60000', MARK: '60000' },
        existingWatches: [],
        ...overrides,
    });
    assert.equal(result.ok, true, result.reason);
    return result.prepared;
}

test('헤지와 단방향 청산 주문을 방향에 맞게 판정한다', () => {
    assert.equal(isCloseOrder({ positionSide: 'LONG', side: 'SELL' }), true);
    assert.equal(isCloseOrder({ positionSide: 'LONG', side: 'BUY' }), false);
    assert.equal(isCloseOrder({ positionSide: 'SHORT', side: 'BUY' }), true);
    assert.equal(isCloseOrder({ positionSide: 'SHORT', side: 'SELL' }), false);
    assert.equal(isCloseOrder({ positionSide: 'BOTH', reduceOnly: true }), true);
    assert.equal(isCloseOrder({ positionSide: 'BOTH', reduceOnly: false }), false);
});

test('포지션은 심볼과 헤지 방향을 함께 골라 단방향 부호로 방향을 만든다', () => {
    const positions = [
        { symbol: 'BTCUSDT', positionSide: 'LONG', positionAmt: '2', entryPrice: '60000' },
        { symbol: 'BTCUSDT', positionSide: 'SHORT', positionAmt: '-3', entryPrice: '62000' },
    ];
    assert.deepEqual(pickPosition(positions, 'BTCUSDT', 'LONG'), {
        positionSide: 'LONG', direction: 'LONG', sizeAbs: '2', entryPrice: '60000',
    });
    assert.deepEqual(pickPosition(positions, 'BTCUSDT', 'SHORT'), {
        positionSide: 'SHORT', direction: 'SHORT', sizeAbs: '3', entryPrice: '62000',
    });
    assert.deepEqual(pickPosition([
        { symbol: 'BTCUSDT', positionSide: 'BOTH', positionAmt: '-1.5', entryPrice: '61000' },
    ], 'BTCUSDT', 'BOTH'), {
        positionSide: 'BOTH', direction: 'SHORT', sizeAbs: '1.5', entryPrice: '61000',
    });
    assert.equal(pickPosition(positions, 'ETHUSDT', 'LONG'), null);
});

test('손익은 롱과 숏의 부호를 십진 정수 연산으로 계산한다', () => {
    assert.equal(D.format(pnlAt(longPosition, '60123.45'), 2), '246.90');
    assert.equal(D.format(pnlAt({ ...longPosition, direction: 'SHORT' }, '60123.45'), 2), '-246.90');
});

test('방향과 목표 도달 판정은 경계를 포함한다', () => {
    assert.equal(directionFor('9.9', '10'), 'UP');
    assert.equal(directionFor('10.1', '10'), 'DOWN');
    assert.equal(directionFor('10', '10'), null);
    assert.equal(hitTarget('10', '10', 'UP'), true);
    assert.equal(hitTarget('10', '10', 'DOWN'), true);
});

test('canArm은 방향을 채우고 이미 닿음, 청산 전용, 상한을 거부한다', () => {
    const result = canArm({
        order,
        triggers: { price: { ref: 'LAST', target: '61000' }, pnl: { target: '1000' } },
        position: longPosition,
        current: { LAST: '60000', MARK: '60000' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.prepared.triggers.price.dir, 'UP');
    assert.equal(result.prepared.triggers.pnl.dir, 'UP');
    assert.equal(result.prepared.position.expectedSizeAbs, '2');

    assert.equal(canArm({
        order: { ...order, reduceOnly: false },
        triggers: { pnl: { target: '1000' } },
        position: longPosition,
        current: { LAST: '60000' },
    }).reason, '손익 조건은 청산 주문만 허용됩니다');
    assert.equal(canArm({
        order,
        triggers: { price: { ref: 'LAST', target: '60000' } },
        current: { LAST: '60000' },
    }).reason, '이미 닿음 — 지금 Chase');
    assert.equal(canArm({
        order,
        triggers: { price: { ref: 'LAST', target: '61000' } },
        current: { LAST: '60000' },
        existingWatches: [{ orderId: 7, symbol: 'BTCUSDT', state: 'ARMED' }],
    }).ok, false);
    const tenSymbols = Array.from({ length: 10 }, (_, index) => ({ orderId: index, symbol: `S${index}`, state: 'ARMED' }));
    assert.equal(canArm({
        order,
        triggers: { price: { ref: 'LAST', target: '61000' } },
        current: { LAST: '60000' },
        existingWatches: tenSymbols,
    }).ok, false);
    const thirtyOrders = Array.from({ length: 30 }, (_, index) => ({ orderId: index, symbol: 'BTCUSDT', state: 'ARMED' }));
    assert.equal(canArm({
        order: { ...order, orderId: 99 },
        triggers: { price: { ref: 'LAST', target: '61000' } },
        current: { LAST: '60000' },
        existingWatches: thirtyOrders,
    }).ok, false);
});

test('evaluateTrigger는 가격과 손익 조건을 구분해 반환한다', () => {
    const watch = armed();
    assert.deepEqual(evaluateTrigger(watch, { LAST: '61000', MARK: '60000' }), { fired: true, conditions: ['price', 'pnl'] });
    assert.deepEqual(evaluateTrigger(watch, { LAST: '60000', MARK: '60000' }), { fired: false, conditions: [] });
});

test('PRICE 발동은 TRIGGERED에 래치되고 가격이 되돌아가도 유지된다', () => {
    const watch = armed();
    const triggered = transition(watch, { type: 'PRICE', prices: { LAST: '61000' } }, 1000);
    assert.equal(triggered.watch.state, 'TRIGGERED');
    assert.deepEqual(triggered.effects, ['NOTIFY', 'REFETCH']);
    const unchanged = transition(triggered.watch, { type: 'PRICE', prices: { LAST: '60000' } }, 2000);
    assert.equal(unchanged.watch.state, 'TRIGGERED');
    assert.notEqual(unchanged.watch, triggered.watch);
});

test('수정 이벤트가 응답보다 먼저 와도 나중에 와도 중복 대기 없이 CHASING이 된다', () => {
    let watch = transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 900).watch, {
        type: 'MODIFY_SENT', modifyId: 'm1',
    }, 1000).watch;
    const eventFirst = transition(watch, {
        type: 'ORDER_EVENT',
        o: { x: 'AMENDMENT', i: 7, M: 'm1', p: '60100', X: 'NEW' },
    }, 1100).watch;
    assert.equal(eventFirst.expectedAmendments.length, 0);
    assert.equal(eventFirst.known.price, '60100');
    const afterResponse = transition(eventFirst, {
        type: 'MODIFY_OK',
        response: { orderId: 7, modifyId: 'm1', price: '60100', status: 'NEW' },
    }, 1200).watch;
    assert.equal(afterResponse.state, 'CHASING');
    assert.equal(afterResponse.expectedAmendments.length, 0);

    watch = transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 900).watch, {
        type: 'MODIFY_SENT', modifyId: 'm2',
    }, 1000).watch;
    const responseFirst = transition(watch, {
        type: 'MODIFY_OK',
        response: { orderId: 7, modifyId: 'm2', price: '60200', status: 'NEW' },
    }, 1100).watch;
    assert.equal(responseFirst.known.price, '60200');
    const eventLater = transition(responseFirst, {
        type: 'ORDER_EVENT',
        o: { x: 'AMENDMENT', i: 7, M: 'm2', p: '60200', X: 'NEW' },
    }, 1200).watch;
    assert.equal(eventLater.state, 'CHASING');
    assert.equal(eventLater.expectedAmendments.length, 0);
});

test('다른 주문의 같은 수정 ID, M 없는 수정, 취소와 체결을 구분한다', () => {
    let watch = transition(armed(), { type: 'MODIFY_SENT', modifyId: 'same' }, 1000).watch;
    assert.equal(transition(watch, { type: 'ORDER_EVENT', o: { x: 'AMENDMENT', i: 8, M: 'same' } }, 1100).watch.state, 'ARMED');
    watch = transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 900).watch, {
        type: 'MODIFY_SENT', modifyId: 'same',
    }, 1000).watch;
    assert.equal(transition(watch, { type: 'ORDER_EVENT', o: { x: 'AMENDMENT', i: 7 } }, 1100).watch.state, 'DISARMED');
    assert.equal(transition(armed(), { type: 'ORDER_EVENT', o: { i: 7, X: 'CANCELED' } }, 1100).watch.state, 'DISARMED');

    watch = transition(armed(), { type: 'ORDER_EVENT', o: { i: 7, x: 'TRADE', z: '0.5', X: 'PARTIALLY_FILLED' } }, 1100).watch;
    assert.equal(watch.known.executedQty, '0.5');
    assert.equal(watch.position.expectedSizeAbs, '1.5');
    const done = transition(watch, { type: 'ORDER_EVENT', o: { i: 7, x: 'TRADE', z: '2', X: 'FILLED' } }, 1200).watch;
    assert.equal(done.state, 'DONE');
    assert.equal(done.position.expectedSizeAbs, '0');
});

test('ORDER_EVENT는 큰 주문 번호의 숫자·문자열 혼용을 정확히 대조한다', () => {
    const bigOrderId = '8389766283190065001';
    const watch = armed({ order: { ...order, orderId: bigOrderId } });
    const matched = transition(watch, {
        type: 'ORDER_EVENT',
        o: { i: bigOrderId, x: 'TRADE', z: '0.5', X: 'PARTIALLY_FILLED' },
    }, 1100).watch;
    assert.equal(matched.known.executedQty, '0.5');

    const other = transition(watch, {
        type: 'ORDER_EVENT',
        o: { i: '8389766283190065002', x: 'TRADE', z: '0.5', X: 'PARTIALLY_FILLED' },
    }, 1100).watch;
    assert.equal(other.known.executedQty, '0');
});

test('포지션 변화와 수정 실패는 해제 또는 일시정지한다', () => {
    const watch = armed();
    const positionDecrease = transition(watch, { type: 'ACCOUNT_POSITION', position: { ...longPosition, sizeAbs: '1' } }, 1000);
    assert.equal(positionDecrease.watch.state, 'ARMED');
    assert.deepEqual(positionDecrease.effects, ['REFETCH']);
    assert.equal(transition(watch, { type: 'ACCOUNT_POSITION', position: { ...longPosition, sizeAbs: '0' } }, 1000).watch.reason, '포지션 없음');
    const triggered = transition(watch, { type: 'PRICE', prices: { LAST: '61000' } }, 900).watch;
    assert.equal(transition(triggered, { type: 'MODIFY_REJECTED', msg: '가격 필수' }, 1000).watch.reason, '수정 거부: 가격 필수');
    assert.equal(transition(triggered, { type: 'MODIFY_UNKNOWN' }, 1000).watch.state, 'PAUSED');
});

test('ACCOUNT_UPDATE는 대상이 없으면 무시하고 명시된 0만 포지션 없음으로 해석한다', () => {
    assert.deepEqual(accountPositionOf([{ s: 'ETHUSDT', ps: 'LONG', pa: '1', ep: '100' }], 'BTCUSDT', 'LONG'), {
        present: false,
        position: undefined,
    });
    assert.deepEqual(accountPositionOf([{ s: 'BTCUSDT', ps: 'LONG', pa: '0', ep: '100' }], 'BTCUSDT', 'LONG'), {
        present: true,
        position: null,
    });
    assert.equal(accountPositionOf([{ s: 'BTCUSDT', ps: 'LONG', pa: '1', ep: '100' }], 'BTCUSDT', 'LONG').position.sizeAbs, '1');
});

test('공백, 재시작, 한도 임박, 전체 정지는 활성 감시를 일시정지하고 완료·해제는 보존한다', () => {
    for (const type of ['GAP', 'WORKER_RESTART', 'RATE_LIMIT_NEAR', 'STOP_ALL']) {
        assert.equal(transition(armed(), { type }, 1000).watch.state, 'PAUSED', type);
    }
    const done = { ...armed(), state: 'DONE' };
    assert.equal(transition(done, { type: 'STOP_ALL' }, 1000).watch.state, 'DONE');
    const disarmed = { ...armed(), state: 'DISARMED' };
    assert.equal(transition(disarmed, { type: 'GAP' }, 1000).watch.state, 'DISARMED');

    const paused = transition(armed(), { type: 'GAP', gapStartedAt: 500, gapEndedAt: 1000 }, 1000).watch;
    assert.equal(paused.gapStartedAt, 500);
    assert.equal(paused.gapEndedAt, 1000);
    for (const type of ['GAP', 'WORKER_RESTART', 'RATE_LIMIT_NEAR', 'STOP_ALL']) {
        const repeated = transition(paused, { type }, 1100);
        assert.equal(repeated.watch.state, 'PAUSED', type);
        assert.equal(repeated.watch.reason, '공백', type);
        assert.deepEqual(repeated.effects, [], type);
    }
});

test('재개는 주문·포지션이 같을 때만 이전 상태로 복원한다', () => {
    const paused = transition(armed(), { type: 'GAP' }, 1000).watch;
    const resumed = transition(paused, { type: 'RESUME_CHECKED', order, position: longPosition }, 2000).watch;
    assert.equal(resumed.state, 'ARMED');
    assert.equal(transition(paused, { type: 'RESUME_CHECKED', order: { ...order, price: '61000' }, position: longPosition }, 2000).watch.state, 'DISARMED');
});

test('shouldModify는 가격 차이, 간격, 분당 상한, 대기 중 수정을 모두 확인한다', () => {
    const watch = { ...armed(), state: 'CHASING', known: { ...armed().known, price: '60000' }, modifyTimes: [5000, 6000] };
    assert.equal(shouldModify(watch, '60100', 7000, { minIntervalMs: 2000, maxPerMinute: 3 }), false);
    assert.equal(shouldModify(watch, '60100', 9000, { minIntervalMs: 2000, maxPerMinute: 3 }), true);
    assert.equal(shouldModify(watch, '60000', 9000, { minIntervalMs: 0, maxPerMinute: 3 }), false);
    assert.equal(shouldModify({ ...watch, expectedAmendments: [{ orderId: 7, modifyId: 'm', sentAt: 8500 }] }, '60100', 9000, { minIntervalMs: 0, maxPerMinute: 3 }), false);
    assert.equal(shouldModify(watch, '60100', 9000, { minIntervalMs: 0, maxPerMinute: 2 }), false);
});

test('시각 공백, 스트림 정체, 워커 장벽을 순수 비교한다', () => {
    assert.equal(gapDetected(0, 61, 60), true);
    assert.equal(streamStale(0, 31, 30), true);
    assert.equal(workerBarrier('old', 'new'), true);
    assert.equal(workerBarrier('same', 'same'), false);
    assert.deepEqual(gapWindow(100, 200, 50), { gapStartedAt: 100, gapEndedAt: 200 });
    assert.equal(gapWindow(100, 140, 50), null);
});

test('가격 폴링은 이번 응답의 대상 심볼만 사용하고 REST 주문 종결 상태를 이벤트로 바꾼다', () => {
    const watch = { symbol: 'BTCUSDT', triggers: { price: { ref: 'LAST' }, pnl: { target: '1' } } };
    assert.deepEqual(priceSnapshotFor(watch, new Map([['ETHUSDT', '10']]), new Map()), null);
    assert.deepEqual(priceSnapshotFor(watch, new Map([['BTCUSDT', '100']]), new Map()), { LAST: '100' });
    assert.deepEqual(restOrderEvent({ orderId: 7, status: 'FILLED' }), {
        type: 'ORDER_EVENT',
        o: { orderId: '7', status: 'FILLED', i: '7', X: 'FILLED', x: 'REST' },
    });
    assert.deepEqual(pollFailureEvent({ kind: 'RATE_LIMIT', message: 'limit' }), { type: 'RATE_LIMIT_NEAR' });
    assert.deepEqual(pollFailureEvent({ kind: 'UNKNOWN', message: '네트워크' }), { type: 'POLL_FAILED', reason: '조회 실패: 네트워크' });
});

test('공백 중 완성 봉의 가격과 손익 고저 범위를 판정한다', () => {
    assert.equal(reachedDuringGap([{ high: '61000', low: '60000' }], { price: { ref: 'LAST', target: '60500', dir: 'UP' } }), true);
    assert.equal(reachedDuringGap([{ high: '60100', low: '59000' }], { pnl: { target: '-1000', dir: 'DOWN' } }, longPosition), true);
    assert.equal(reachedDuringGap([{ high: '60100', low: '60000' }], { price: { ref: 'MARK', target: '60500', dir: 'UP' } }), false);
    assert.deepEqual(reachedConditionsDuringGap([{ high: '61000', low: '59000' }], {
        price: { ref: 'MARK', target: '60500', dir: 'UP' },
        pnl: { target: '1000', dir: 'UP' },
    }, longPosition), ['price', 'pnl']);
});

test('재개 요약은 바뀐 필드와 즉시 발동 여부를 낸다', () => {
    const watch = armed();
    const same = summarizeForResume(watch, order, longPosition, { LAST: '60000' });
    assert.deepEqual(same, { unchanged: true, changes: [], firesImmediately: false });
    const changed = summarizeForResume(watch, { ...order, status: 'PARTIALLY_FILLED' }, longPosition, { LAST: '61000' });
    assert.equal(changed.unchanged, false);
    assert.ok(changed.changes.includes('status'));
    assert.equal(changed.firesImmediately, true);
});

test('가격 조건만 있는 감시는 재개 때 포지션 비교를 건너뛴다', () => {
    const result = canArm({
        order,
        triggers: { price: { ref: 'LAST', target: '61000' } },
        current: { LAST: '60000' },
    });
    assert.equal(result.ok, true);
    const paused = transition(result.prepared, { type: 'STOP_ALL' }, 1000).watch;
    const resumed = transition(paused, { type: 'RESUME_CHECKED', order, position: undefined }, 2000).watch;
    assert.equal(resumed.state, 'ARMED');
    assert.deepEqual(summarizeForResume(result.prepared, order, undefined, { LAST: '60000' }), {
        unchanged: true,
        changes: [],
        firesImmediately: false,
    });
});

test('전체 정지 세대는 대기 중 재개를 취소하고 새 재개만 통과시키며 저장 순서를 보장한다', async () => {
    const paused = transition(armed(), { type: 'STOP_ALL' }, 1000).watch;
    assert.deepEqual(cancelledForGeneration(0, 1), { kind: 'CANCELLED', reason: '전체 정지 뒤 취소됨' });
    assert.equal(paused.state, 'PAUSED');

    const serial = createSerialQueue();
    let releaseFirst;
    const firstDone = new Promise((resolve) => { releaseFirst = resolve; });
    const writes = [];
    const storage = { state: 'ARMED' };
    const first = serial(async () => {
        writes.push('ARMED 저장 시작');
        await firstDone;
        storage.state = 'ARMED';
        writes.push('ARMED 저장 완료');
    });
    const second = serial(async () => {
        storage.state = 'PAUSED';
        writes.push('PAUSED 저장 완료');
    });
    await Promise.resolve();
    assert.deepEqual(writes, ['ARMED 저장 시작']);
    releaseFirst();
    await first;
    await second;
    assert.deepEqual(writes, ['ARMED 저장 시작', 'ARMED 저장 완료', 'PAUSED 저장 완료']);
    assert.equal(storage.state, 'PAUSED');

    assert.equal(cancelledForGeneration(1, 1), null);
    assert.equal(transition(paused, {
        type: 'RESUME_CHECKED', order, position: longPosition,
    }, 2000).watch.state, 'ARMED');
});

test('주문 REST 재조회가 같은 가격의 우리 수정을 확인하고 다른 가격은 해제한다', () => {
    let watch = transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 900).watch, {
        type: 'MODIFY_SENT', modifyId: 'rest-1',
    }, 1000).watch;
    watch = transition(watch, {
        type: 'MODIFY_OK',
        response: { orderId: 7, modifyId: 'rest-1', price: '60100', status: 'NEW' },
    }, 1100).watch;
    const confirmed = transition(watch, {
        type: 'ORDER_REFETCHED',
        order: { ...order, price: '60100' },
    }, 1200).watch;
    assert.equal(confirmed.expectedAmendments.length, 0);
    assert.equal(shouldModify(confirmed, '60200', 1200), true);

    watch = transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 900).watch, {
        type: 'MODIFY_SENT', modifyId: 'rest-2',
    }, 1000).watch;
    watch = transition(watch, {
        type: 'MODIFY_OK',
        response: { orderId: 7, modifyId: 'rest-2', price: '60100', status: 'NEW' },
    }, 1100).watch;
    assert.equal(transition(watch, {
        type: 'ORDER_REFETCHED',
        order: { ...order, price: '60050' },
    }, 1200).watch.state, 'DISARMED');
});

test('REST 주문 종결 상태는 스트림 주문 이벤트와 같은 최종 상태가 된다', () => {
    const filled = transition(armed(), {
        type: 'ORDER_EVENT',
        o: { i: 7, X: 'FILLED', x: 'REST' },
    }, 1000);
    assert.equal(filled.watch.state, 'DONE');
    assert.ok(filled.effects.includes('REMOVE'));
    const canceled = transition(armed(), {
        type: 'ORDER_EVENT',
        o: { i: 7, X: 'CANCELED', x: 'REST' },
    }, 1000);
    assert.equal(canceled.watch.state, 'DISARMED');
});

test('다른 주문의 체결·취소·완료 이벤트는 상태와 부수 동작을 바꾸지 않는다', () => {
    for (const o of [
        { i: 8, x: 'TRADE', z: '2', X: 'FILLED' },
        { i: 8, X: 'CANCELED' },
        { i: 8, X: 'FILLED' },
    ]) {
        const source = armed();
        const result = transition(source, { type: 'ORDER_EVENT', o }, 1000);
        assert.deepEqual(result.watch, source);
        assert.deepEqual(result.effects, []);
    }
});

test('누적 체결량은 증가할 때만 반영하고 중복·역순 이벤트는 무시한다', () => {
    let watch = transition(armed(), {
        type: 'ORDER_EVENT',
        o: { i: 7, x: 'TRADE', z: '1', X: 'PARTIALLY_FILLED' },
    }, 1000).watch;
    assert.equal(watch.position.expectedSizeAbs, '1');
    const duplicate = transition(watch, {
        type: 'ORDER_EVENT',
        o: { i: 7, x: 'TRADE', z: '1', X: 'PARTIALLY_FILLED' },
    }, 1100).watch;
    assert.deepEqual(duplicate, watch);
    const reversed = transition(duplicate, {
        type: 'ORDER_EVENT',
        o: { i: 7, x: 'TRADE', z: '0.5', X: 'PARTIALLY_FILLED' },
    }, 1200).watch;
    assert.deepEqual(reversed, duplicate);
    const increased = transition(reversed, {
        type: 'ORDER_EVENT',
        o: { i: 7, x: 'TRADE', z: '1.5', X: 'PARTIALLY_FILLED' },
    }, 1300).watch;
    assert.equal(increased.known.executedQty, '1.5');
    assert.equal(increased.position.expectedSizeAbs, '0.5');
});

test('체결보다 앞선 포지션 감소는 재조회를 요청하고 재조회 결과를 대조한다', () => {
    const early = transition(armed(), {
        type: 'ACCOUNT_POSITION',
        position: { ...longPosition, sizeAbs: '1.5' },
    }, 1000);
    assert.equal(early.watch.state, 'ARMED');
    assert.deepEqual(early.effects, ['REFETCH']);
    assert.equal(early.watch.positionReconcilePending, true);

    const afterTrade = transition(early.watch, {
        type: 'ORDER_EVENT',
        o: { i: 7, x: 'TRADE', z: '0.5', X: 'PARTIALLY_FILLED' },
    }, 1100).watch;
    const matched = transition(afterTrade, {
        type: 'POSITION_REFETCHED',
        position: { ...longPosition, sizeAbs: '1.5' },
    }, 1200);
    assert.equal(matched.watch.state, 'ARMED');
    assert.equal(matched.watch.positionReconcilePending, undefined);
    assert.deepEqual(matched.effects, []);

    const pending = transition(armed(), {
        type: 'ACCOUNT_POSITION',
        position: { ...longPosition, sizeAbs: '1.5' },
    }, 1000).watch;
    const secondRefetch = transition(pending, {
        type: 'POSITION_REFETCHED',
        position: { ...longPosition, sizeAbs: '1.4' },
    }, 1100);
    assert.equal(secondRefetch.watch.state, 'DISARMED');
    assert.deepEqual(secondRefetch.effects, []);
    const secondStream = transition(pending, {
        type: 'ACCOUNT_POSITION',
        position: { ...longPosition, sizeAbs: '1.4' },
    }, 1100);
    assert.equal(secondStream.watch.state, 'DISARMED');
    assert.deepEqual(secondStream.effects, []);
    const firstRefetch = transition(armed(), {
        type: 'POSITION_REFETCHED',
        position: { ...longPosition, sizeAbs: '1.5' },
    }, 1000);
    assert.equal(firstRefetch.watch.state, 'ARMED');
    assert.equal(firstRefetch.watch.positionReconcilePending, true);
    assert.deepEqual(firstRefetch.effects, ['REFETCH']);

    const disarmed = transition(pending, { type: 'DISARM', reason: '사용자 해제' }, 1100);
    assert.equal(disarmed.watch.positionReconcilePending, undefined);
    const done = transition(pending, {
        type: 'ORDER_EVENT',
        o: { i: 7, x: 'TRADE', z: '2', X: 'FILLED' },
    }, 1100);
    assert.equal(done.watch.state, 'DONE');
    assert.equal(done.watch.positionReconcilePending, undefined);
    assert.equal(transition(armed(), {
        type: 'ACCOUNT_POSITION',
        position: { ...longPosition, sizeAbs: '2.1' },
    }, 1000).watch.state, 'DISARMED');
    assert.equal(transition(armed(), {
        type: 'ACCOUNT_POSITION',
        position: { ...longPosition, direction: 'SHORT', sizeAbs: '1.5' },
    }, 1000).watch.state, 'DISARMED');
    assert.equal(transition(armed(), {
        type: 'ACCOUNT_POSITION',
        position: { ...longPosition, entryPrice: '60100', sizeAbs: '1.5' },
    }, 1000).watch.state, 'DISARMED');
});

test('수정 응답과 재개는 상태 제한을 지키고 종료 상태를 되살리지 않는다', () => {
    let watch = transition(armed(), { type: 'MODIFY_OK', response: { price: '60100' } }, 1000).watch;
    assert.equal(watch.state, 'ARMED');
    assert.equal(watch.known.price, order.price);

    const sent = transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 500).watch, {
        type: 'MODIFY_SENT', modifyId: 'late',
    }, 1000).watch;
    const paused = transition(sent, { type: 'GAP' }, 1100).watch;
    const lateOk = transition(paused, { type: 'MODIFY_OK', response: { price: '60100' } }, 1200).watch;
    assert.equal(lateOk.state, 'PAUSED');
    assert.equal(lateOk.known.price, '60100');
    assert.equal(lateOk.expectedAmendments.length, 1);
    const resumedFromLateOk = transition(lateOk, {
        type: 'RESUME_CHECKED',
        order: { ...order, price: '60100' },
        position: longPosition,
    }, 1250).watch;
    assert.equal(resumedFromLateOk.state, 'TRIGGERED');
    assert.equal(transition(lateOk, { type: 'MODIFY_REJECTED', msg: '늦음' }, 1300).watch.state, 'PAUSED');
    assert.equal(transition(lateOk, { type: 'MODIFY_UNKNOWN' }, 1300).watch.state, 'PAUSED');
    const stopPaused = transition(sent, { type: 'STOP_ALL' }, 1150).watch;
    const stopLateOk = transition(stopPaused, { type: 'MODIFY_OK', response: { price: '60100' } }, 1200).watch;
    assert.equal(stopLateOk.state, 'PAUSED');
    for (const event of [
        { type: 'ORDER_REFETCHED', order: { ...order, price: '61000' } },
        { type: 'POSITION_REFETCHED', position: { ...longPosition, sizeAbs: '0' } },
        { type: 'ACCOUNT_POSITION', position: { ...longPosition, sizeAbs: '0' } },
    ]) {
        assert.equal(transition(stopPaused, event, 1200).watch.state, 'PAUSED');
    }

    const rejected = transition(
        transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 500).watch,
            { type: 'MODIFY_REJECTED', msg: '거부' }, 600).watch,
        { type: 'RESUME_CHECKED', order, position: longPosition }, 700,
    ).watch;
    assert.equal(rejected.state, 'TRIGGERED');
    const unknown = transition(
        transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 500).watch,
            { type: 'MODIFY_UNKNOWN' }, 600).watch,
        { type: 'RESUME_CHECKED', order, position: longPosition }, 700,
    ).watch;
    assert.equal(unknown.state, 'TRIGGERED');

    const triggered = transition(paused, { type: 'RESUME_CHECKED', order, position: longPosition }, 1400).watch;
    assert.equal(triggered.state, 'TRIGGERED');
    assert.equal(transition(armed(), { type: 'RESUME_CHECKED', order, position: longPosition }, 1400).watch.state, 'ARMED');

    for (const state of ['DONE', 'DISARMED']) {
        const terminal = { ...armed(), state };
        const result = transition(terminal, { type: 'MODIFY_OK', response: { price: '60100' } }, 1000);
        assert.deepEqual(result.watch, terminal);
        assert.deepEqual(result.effects, []);
    }

    const activeDisarmed = transition(armed(), { type: 'DISARM', reason: '사용자 해제' }, 1000);
    assert.equal(activeDisarmed.watch.state, 'DISARMED');
    assert.deepEqual(activeDisarmed.effects, []);
    for (const state of ['DONE', 'DISARMED']) {
        const terminal = transition({ ...armed(), state }, { type: 'DISARM' }, 1000);
        assert.equal(terminal.watch.state, state);
        assert.deepEqual(terminal.effects, []);
    }
});

test('LOCK_ACQUIRED는 TRIGGERED에서만 재조회를 요청한다', () => {
    const triggered = transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 1000).watch;
    assert.deepEqual(transition(triggered, { type: 'LOCK_ACQUIRED' }, 1100).effects, ['REFETCH']);
    assert.deepEqual(transition(armed(), { type: 'LOCK_ACQUIRED' }, 1100).effects, []);
});

test('수정 대기 60초는 정확히 60초에 유지되고 그보다 지나면 정리된다', () => {
    const sent = transition(transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 0).watch, {
        type: 'MODIFY_SENT', modifyId: 'boundary',
    }, 1000).watch;
    const exact = transition(sent, { type: 'PRICE', prices: { LAST: '60000' } }, 61000).watch;
    assert.equal(exact.expectedAmendments.length, 1);
    assert.equal(shouldModify({ ...exact, state: 'CHASING' }, '60100', 61000), false);
    const expired = transition(exact, { type: 'PRICE', prices: { LAST: '60000' } }, 61001).watch;
    assert.equal(expired.expectedAmendments.length, 0);
});

test('호가가 없거나 숫자로 읽히지 않으면 수정하지 않는다', () => {
    const watch = { ...armed(), state: 'CHASING', known: { ...armed().known, price: '60000' } };
    for (const quote of [null, undefined, '', '   ', 'not-a-price', Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(shouldModify(watch, quote, 1000), false, String(quote));
    }
    assert.equal(shouldModify(watch, 60100, 1000), true);
});

test('transition은 원본 객체와 중첩 배열을 바꾸지 않는다', () => {
    const source = transition(armed(), { type: 'PRICE', prices: { LAST: '61000' } }, 1000).watch;
    const snapshot = structuredClone(source);
    transition(source, { type: 'MODIFY_SENT', modifyId: 'immutable' }, 1100);
    assert.deepEqual(source, snapshot);
});

test('스트림 URL과 구독 차이를 순수하게 계산한다', () => {
    assert.equal(buildStreamUrl('market', ['btcusdt@aggTrade', 'btcusdt@markPrice@1s']),
        'wss://fstream.binance.com/market/stream?streams=btcusdt@aggTrade/btcusdt@markPrice@1s');
    assert.equal(buildStreamUrl('public', ['btcusdt@bookTicker']),
        'wss://fstream.binance.com/public/stream?streams=btcusdt@bookTicker');
    assert.equal(buildStreamUrl('private', [], 'a/b?c'),
        'wss://fstream.binance.com/private/ws?listenKey=a%2Fb%3Fc&events=ORDER_TRADE_UPDATE/ACCOUNT_UPDATE');
    assert.deepEqual(diffSubscriptions(['a', 'b'], ['b', 'c']), { subscribe: ['c'], unsubscribe: ['a'] });
});

test('사용량 경고선과 지수 재연결 대기를 판정한다', () => {
    assert.equal(usageNearLimit({ used1m: 1800 }), true);
    assert.equal(rateLimitNear({ orderCount10s: 239, orderCount1m: 959, used1m: 1799 }), false);
    assert.equal(reconnectDelay(0), 1000);
    assert.equal(reconnectDelay(6), 30000);
});

test('필요한 REST 조회는 연결이 살아 있는 축을 제외한다', () => {
    const watch = { state: 'CHASING', symbol: 'BTCUSDT', triggers: { price: { ref: 'MARK' }, pnl: { target: '1' } } };
    assert.deepEqual(requiredRest([watch], { market: 'LIVE', public: 'DOWN', private: 'DOWN' }), {
        positionRisk: true,
        premiumIndex: false,
        tickerPrice: false,
        bookTicker: ['BTCUSDT'],
        orders: ['BTCUSDT'],
    });
});
