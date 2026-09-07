import test from 'node:test';
import assert from 'node:assert/strict';

// execution.js 는 chrome.storage.session 을 쓴다. 네트워크는 건드리지 않는
// 부분만 검증하므로, 저장소만 메모리로 흉내 낸다.
const store = new Map();
globalThis.chrome = {
    storage: {
        session: {
            async get(key) {
                return store.has(key) ? { [key]: store.get(key) } : {};
            },
            async set(entries) {
                for (const [key, value] of Object.entries(entries)) store.set(key, value);
            },
            async remove(key) {
                store.delete(key);
            },
        },
        local: { async get() { return {}; }, async set() {}, async remove() {} },
    },
};

const { ensureState, clientOrderIdFor, unknownCount, readExecution } = await import(
    '../src/background/execution.js'
);

const plan = {
    side: 'LONG',
    levels: [
        { seq: 1, price: '80000.0', quantity: '0.000', skipReason: '최소수량 미달' },
        { seq: 2, price: '75051.4', quantity: '0.001', skipReason: null },
        { seq: 3, price: '70408.9', quantity: '0.003', skipReason: null },
    ],
};
const meta = { symbol: 'BTCUSDT', positionSide: 'LONG', timeInForce: 'GTC' };

test('주문 식별자가 바이낸스 규칙과 길이 제한을 지킨다', () => {
    const id = clientOrderIdFor('a1b2c3d4e5', 9);
    assert.equal(id, 'scale-a1b2c3d4e5-9');
    assert.ok(id.length <= 36);
    assert.match(id, /^[.A-Z:/a-z0-9_-]{1,36}$/);
    assert.throws(() => clientOrderIdFor('a'.repeat(40), 1));
});

test('제외된 회차는 전송 상태에 들어가지 않는다', async () => {
    store.clear();
    const state = await ensureState({ planId: 'p1', plan, meta, mode: 'LIVE' });
    assert.deepEqual(
        state.levels.map((l) => l.seq),
        [2, 3],
    );
    assert.ok(state.levels.every((l) => l.status === 'PENDING'));
});

// 이 버그로 실제 돈이 두 번 나갈 뻔했다(2026-09-08 commit-check).
// 전송이 중단된 뒤 사용자가 실행 버튼을 다시 누르면 상태가 새로 만들어져
// 이미 접수된 회차가 PENDING 으로 되돌아갔다.
test('이미 전송한 계획을 다시 만들지 않는다 — 접수 기록이 보존된다', async () => {
    store.clear();
    const first = await ensureState({ planId: 'p2', plan, meta, mode: 'LIVE' });
    first.levels[0].status = 'ACCEPTED';
    first.levels[0].orderId = 12345;
    await chrome.storage.session.set({ 'exec:p2': first });

    const again = await ensureState({ planId: 'p2', plan, meta, mode: 'LIVE' });
    assert.equal(again.levels[0].status, 'ACCEPTED', '접수된 회차가 PENDING 으로 되돌아가면 안 된다');
    assert.equal(again.levels[0].orderId, 12345);
    assert.equal(again.levels[1].status, 'PENDING');

    const stored = await readExecution('p2');
    assert.equal(stored.levels[0].status, 'ACCEPTED');
});

test('접수 불명 회차를 센다', async () => {
    store.clear();
    const state = await ensureState({ planId: 'p3', plan, meta, mode: 'LIVE' });
    assert.equal(unknownCount(state), 0);
    state.levels[1].status = 'UNKNOWN';
    assert.equal(unknownCount(state), 1);
    assert.equal(unknownCount(null), 0);
});

test('단방향 모드는 positionSide 를 보내지 않는다', async () => {
    store.clear();
    const state = await ensureState({
        planId: 'p4',
        plan,
        meta: { ...meta, positionSide: 'BOTH' },
        mode: 'LIVE',
    });
    assert.equal(state.positionSide, 'BOTH');
});
