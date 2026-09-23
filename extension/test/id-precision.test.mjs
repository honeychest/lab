import test from 'node:test';
import assert from 'node:assert/strict';
import {
    JsonFormatError,
    parseRestJsonWithStringIds,
    parseWebsocketJsonWithStringIds,
} from '../src/background/binance.js';

const ORDER_ID = '8389766283190065001';
const TRADE_ID = '8389766283190065002';

test('REST 원문은 중첩 객체와 배열의 정수 ID를 문자열로 보존한다', () => {
    const raw = JSON.stringify({
        orderId: Number(ORDER_ID),
        id: 7,
        nested: [{ amendmentId: 9, modifyId: 13, tradeId: Number(TRADE_ID), updateId: 11 }],
        executionId: 15,
        algoId: 16,
        strategyId: 17,
        origOrderId: 42,
        updateTime: 1712345678901,
        price: '30005',
        text: `literal "orderId":${ORDER_ID}`,
    }).replace(String(Number(ORDER_ID)), ORDER_ID).replace(String(Number(TRADE_ID)), TRADE_ID);

    const parsed = JSON.parse(parseRestJsonWithStringIds(raw));
    assert.equal(parsed.orderId, ORDER_ID);
    assert.equal(parsed.id, 7);
    assert.equal(parsed.nested[0].amendmentId, '9');
    assert.equal(parsed.nested[0].modifyId, '13');
    assert.equal(parsed.nested[0].tradeId, Number(TRADE_ID));
    assert.equal(parsed.nested[0].updateId, 11);
    assert.equal(parsed.executionId, 15);
    assert.equal(parsed.algoId, 16);
    assert.equal(parsed.strategyId, 17);
    assert.equal(parsed.origOrderId, 42);
    assert.equal(parsed.updateTime, 1712345678901);
    assert.equal(parsed.price, '30005');
    assert.equal(parsed.text, `literal "orderId":${ORDER_ID}`);
});

test('웹소켓 원문은 주문 이벤트의 i·t·M을 문자열로 보존한다', () => {
    const raw = `{"e":"ORDER_TRADE_UPDATE","i":"account","o":{"i":${ORDER_ID},"t":${TRADE_ID},"M":17,"p":"30005"}}`;
    const parsed = JSON.parse(parseWebsocketJsonWithStringIds(raw));
    assert.equal(parsed.i, 'account');
    assert.equal(parsed.o.i, ORDER_ID);
    assert.equal(parsed.o.t, TRADE_ID);
    assert.equal(parsed.o.M, '17');
    assert.equal(parsed.o.p, '30005');
});

test('REST와 다른 웹소켓 이벤트의 한 글자 키는 숫자로 남는다', () => {
    const rest = JSON.parse(parseRestJsonWithStringIds('{"i":17,"t":18,"M":19,"orderId":20}'));
    assert.deepEqual(rest, { i: 17, t: 18, M: 19, orderId: '20' });
    const other = JSON.parse(parseWebsocketJsonWithStringIds('{"e":"ACCOUNT_UPDATE","a":{"i":17,"t":18,"M":19}}'));
    assert.deepEqual(other, { e: 'ACCOUNT_UPDATE', a: { i: 17, t: 18, M: 19 } });
});

test('ID의 소수점과 지수 표기는 형식 오류로 거부한다', () => {
    for (const raw of [
        '{"orderId":1.5}',
        '{"orderId":1e20}',
        '{"e":"ORDER_TRADE_UPDATE","o":{"i":-1e5}}',
    ]) {
        assert.throws(() => (raw.includes('ORDER_TRADE_UPDATE')
            ? parseWebsocketJsonWithStringIds(raw)
            : parseRestJsonWithStringIds(raw)), JsonFormatError);
    }
});
