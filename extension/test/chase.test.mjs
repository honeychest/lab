import test from 'node:test';
import assert from 'node:assert/strict';
import {
    amendmentTraced,
    chaseParamsOf,
    classifyModifyResponse,
    createModifyIdGenerator,
    formatPrice,
    formatQuantity,
    sameOrder,
    symbolFromPageUrl,
} from '../src/core/chase.js';

test('가격 표시 자릿수를 호가 단위에 맞춰 자르고 0을 뗀다', () => {
    assert.equal(formatPrice('0.1995500', 5), '0.19955');
    assert.equal(formatPrice('86451.50', 1), '86451.5');
    assert.equal(formatPrice('6.916', 3), '6.916');
    assert.equal(formatPrice('0.1995500', null), '0.19955');
    assert.equal(formatPrice('100.000', null), '100');
    assert.equal(formatPrice('1.234', 2), '1.234');
});

test('수량 표시에는 천 단위 쉼표를 넣고 0을 뗀다', () => {
    assert.equal(formatQuantity('92982'), '92,982');
    assert.equal(formatQuantity('1725.000'), '1,725');
    assert.equal(formatQuantity('0.500'), '0.5');
    assert.equal(formatQuantity('bad'), 'bad');
});

const order = {
    orderId: 42,
    symbol: 'BTCUSDT',
    side: 'BUY',
    positionSide: 'BOTH',
    type: 'LIMIT',
    timeInForce: 'GTC',
    reduceOnly: true,
    price: '60000.00',
    origQty: '0.2015500',
    executedQty: '0.00155',
    status: 'NEW',
};

test('Chase 대상 주문의 파라미터 모양을 만든다', () => {
    const result = chaseParamsOf(order, 123456);
    assert.deepEqual(result, {
        ok: true,
        params: {
            symbol: 'BTCUSDT',
            orderId: '42',
            side: 'BUY',
            quantity: '0.2015500',
            priceMatch: 'QUEUE',
            modifyId: 123456,
        },
    });
});

test('Chase는 안전 범위를 넘는 주문 번호를 그대로 문자열로 보낸다', () => {
    const orderId = '8389766283190065001';
    const result = chaseParamsOf({ ...order, orderId }, '9007199254740993');
    assert.equal(result.params.orderId, orderId);
    assert.equal(typeof result.params.orderId, 'string');
});

test('LIMIT이 아니면 거부한다', () => {
    assert.equal(chaseParamsOf({ ...order, type: 'MARKET' }, 1).ok, false);
});

test('미체결 상태가 아니면 거부한다', () => {
    assert.equal(chaseParamsOf({ ...order, status: 'FILLED' }, 1).ok, false);
});

test('남은 수량이 없으면 거부한다', () => {
    assert.equal(chaseParamsOf({ ...order, executedQty: order.origQty }, 1).ok, false);
});

test('부분 체결도 남은 수량이 있으면 허용한다', () => {
    assert.equal(chaseParamsOf({ ...order, status: 'PARTIALLY_FILLED' }, 1).ok, true);
});

test('sameOrder는 숫자 표기 차이를 같은 값으로 본다', () => {
    assert.deepEqual(
        sameOrder(order, { ...order, price: '60000.0000', origQty: '0.201550000', executedQty: '0.0015500' }),
        [],
    );
});

test('sameOrder는 다른 필드 이름을 모두 돌려준다', () => {
    const diff = sameOrder(order, { ...order, side: 'SELL', status: 'PARTIALLY_FILLED', price: '61000' });
    assert.deepEqual(diff, ['side', 'price', 'status']);
});

test('modifyId는 같은 ms에서 순번을 올린다', () => {
    const generator = createModifyIdGenerator();
    assert.deepEqual([generator.next(1000), generator.next(1000), generator.next(1000)], [1000000, 1000001, 1000002]);
});

test('modifyId는 999 초과와 시계 역행을 다음 ms로 잇는다', () => {
    const generator = createModifyIdGenerator();
    const first = generator.next(2000);
    for (let i = 0; i < 999; i += 1) generator.next(2000);
    const afterOverflow = generator.next(2000);
    const afterBackward = generator.next(1990);
    assert.equal(first, 2000000);
    assert.equal(afterOverflow, 2001000);
    assert.equal(afterBackward, 2002000);
});

test('modifyId는 항상 단조 증가하고 안전한 정수다', () => {
    const generator = createModifyIdGenerator();
    const values = [generator.next(3000), generator.next(2999), generator.next(3000), generator.next(3000)];
    assert.ok(values.every((value) => Number.isSafeInteger(value) && value > 0));
    assert.ok(values.every((value, index) => index === 0 || value > values[index - 1]));
});

test('modifyId 생성기는 상태를 복원하고 snapshot을 제공한다', () => {
    const first = createModifyIdGenerator();
    first.next(4000);
    const restored = createModifyIdGenerator(first.snapshot());
    assert.equal(restored.next(4000), 4000001);
    assert.deepEqual(restored.snapshot(), { lastMs: 4000, lastSequence: 1 });
});

test('주소창 심볼은 두 경로 형태만 허용한다', () => {
    assert.equal(symbolFromPageUrl('https://www.binance.com/futures/BTCUSDT'), 'BTCUSDT');
    assert.equal(symbolFromPageUrl('https://www.binance.com/ko/futures/btcusdt'), 'BTCUSDT');
    assert.equal(symbolFromPageUrl('https://www.binance.com/en-US/futures/ETHUSDT'), 'ETHUSDT');
});

test('주소창 심볼은 host, protocol, 이름을 확인한다', () => {
    assert.equal(symbolFromPageUrl('https://binance.com/futures/BTCUSDT'), null);
    assert.equal(symbolFromPageUrl('http://www.binance.com/futures/BTCUSDT'), null);
    assert.equal(symbolFromPageUrl('https://www.binance.com/futures/BTC-USDT'), null);
    assert.equal(symbolFromPageUrl(null), null);
});

test('정상 수정 응답만 CHASED로 분류한다', () => {
    assert.deepEqual(
        classifyModifyResponse({ orderId: 42, modifyId: 9 }, { orderId: 42, modifyId: 9, price: '59999', status: 'NEW' }),
        { kind: 'CHASED', price: '59999', status: 'NEW', modifyId: 9 },
    );
});

test('수정 응답은 큰 주문 번호와 작은 숫자·문자열 혼용을 같은 값으로 본다', () => {
    const orderId = '8389766283190065001';
    assert.equal(
        classifyModifyResponse(
            { orderId: '42', modifyId: '9' },
            { orderId: 42, modifyId: 9, price: '59999', status: 'NEW' },
        ).kind,
        'CHASED',
    );
    assert.equal(
        classifyModifyResponse(
            { orderId, modifyId: '9007199254740993' },
            { orderId, modifyId: 9007199254740993n, price: '59999', status: 'NEW' },
        ).kind,
        'CHASED',
    );
    assert.equal(
        classifyModifyResponse(
            { orderId, modifyId: '9007199254740993' },
            { orderId: '8389766283190065002', modifyId: '9007199254740993', price: '59999', status: 'NEW' },
        ).kind,
        'MISMATCH',
    );
});

test('수정 응답의 각 불일치를 MISMATCH로 분류한다', () => {
    const sent = { orderId: 42, modifyId: 9 };
    assert.equal(classifyModifyResponse(sent, { orderId: 41, modifyId: 9, price: '1', status: 'NEW' }).kind, 'MISMATCH');
    assert.equal(classifyModifyResponse(sent, { orderId: 42, modifyId: 8, price: '1', status: 'NEW' }).kind, 'MISMATCH');
    assert.equal(classifyModifyResponse(sent, { orderId: 42, modifyId: 9, status: 'NEW' }).kind, 'MISMATCH');
    assert.equal(classifyModifyResponse(sent, { orderId: 42, modifyId: 9, price: '1', status: 'FILLED' }).kind, 'MISMATCH');
});

test('문서 모양의 중첩 amendment.modifyId에서 수정 이력 흔적을 찾는다', () => {
    assert.equal(
        amendmentTraced([
            {
                amendmentId: 5363,
                symbol: 'BTCUSDT',
                orderId: 20072994037,
                amendment: {
                    price: { before: '30004', after: '30003.2' },
                    origQty: { before: '1', after: '1' },
                    count: 3,
                    modifyId: 123,
                },
            },
        ], '123'),
        true,
    );
});

test('최상위 modifyId도 수정 이력 흔적으로 허용한다', () => {
    assert.equal(amendmentTraced([{ modifyId: 1 }, { modifyId: '9' }], 9), true);
});

test('수정 이력의 modifyId가 다르면 흔적이 아니다', () => {
    assert.equal(amendmentTraced([{ amendment: { modifyId: 8 } }, { modifyId: 10 }], 9), false);
});

test('빈 배열과 null 수정 이력은 흔적이 아니다', () => {
    assert.equal(amendmentTraced([], 9), false);
    assert.equal(amendmentTraced(null, 9), false);
});
