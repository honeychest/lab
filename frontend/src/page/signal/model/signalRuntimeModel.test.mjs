import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCandle,
  appendOi,
  applyAggTrade,
  applyAggTrades,
  applyForceOrder,
  applyForceOrders,
  createSignalRuntimeState,
  resetSignalRuntimeState,
} from './signalRuntimeModel.js';

test('applyAggTrade adds buyer-maker trade value to short energy and short trade buffer', () => {
  const state = createSignalRuntimeState({
    shortTrades: Array.from({ length: 20 }, (_, idx) => ({ id: idx })),
  });
  const trade = {
    symbol: 'BTCUSDT',
    price: '100',
    quantity: '2',
    isBuyerMaker: true,
  };

  const next = applyAggTrade(state, trade, 'BTCUSDT');

  assert.equal(next.shortEnergy, 200);
  assert.equal(next.longEnergy, 0);
  assert.equal(next.shortTrades.length, 20);
  assert.deepEqual(next.shortTrades.at(-1), trade);
  assert.deepEqual(next.longTrades, []);
});

test('applyAggTrade adds non-buyer-maker trade value to long energy and ignores other symbols', () => {
  const state = createSignalRuntimeState({ longEnergy: 50 });
  const trade = {
    symbol: 'BTCUSDT',
    price: '10',
    quantity: '3',
    isBuyerMaker: false,
  };

  const next = applyAggTrade(state, trade, 'BTCUSDT');
  const ignored = applyAggTrade(next, { ...trade, symbol: 'ENAUSDT' }, 'BTCUSDT');

  assert.equal(next.longEnergy, 80);
  assert.deepEqual(next.longTrades, [trade]);
  assert.equal(ignored, next);
});

test('applyAggTrades consumes every matching trade in a batch', () => {
  const state = createSignalRuntimeState();
  const trades = [
    { symbol: 'BTCUSDT', price: '10', quantity: '2', isBuyerMaker: false },
    { symbol: 'BTCUSDT', price: '20', quantity: '3', isBuyerMaker: true },
    { symbol: 'ENAUSDT', price: '100', quantity: '9', isBuyerMaker: false },
  ];

  const next = applyAggTrades(state, trades, 'BTCUSDT');

  assert.equal(next.longEnergy, 20);
  assert.equal(next.shortEnergy, 60);
  assert.deepEqual(next.longTrades, [trades[0]]);
  assert.deepEqual(next.shortTrades, [trades[1]]);
});

test('applyForceOrder accumulates liquidation totals and buffers without touching energy', () => {
  const state = createSignalRuntimeState({
    longEnergy: 100,
    shortEnergy: 20,
    longLiqEvents: Array.from({ length: 50 }, (_, idx) => ({ id: idx })),
  });
  const longLiquidation = {
    symbol: 'BTCUSDT',
    side: 'SELL',
    price: '40',
    quantity: '3',
  };
  const shortLiquidation = {
    symbol: 'BTCUSDT',
    side: 'BUY',
    price: '10',
    quantity: '2',
  };

  const afterLong = applyForceOrder(state, longLiquidation, 'BTCUSDT');
  const afterShort = applyForceOrder(afterLong, shortLiquidation, 'BTCUSDT');

  assert.equal(afterLong.longEnergy, 100);
  assert.equal(afterLong.longLiqTotal, 120);
  assert.equal(afterLong.longLiqEvents.length, 50);
  assert.deepEqual(afterLong.longLiqEvents[0], longLiquidation);
  assert.equal(afterShort.shortEnergy, 20);
  assert.equal(afterShort.shortLiqTotal, 20);
  assert.deepEqual(afterShort.shortLiqEvents, [shortLiquidation]);
});

test('applyForceOrders consumes every matching liquidation in a batch', () => {
  const state = createSignalRuntimeState();
  const orders = [
    { symbol: 'BTCUSDT', side: 'SELL', price: '40', quantity: '3' },
    { symbol: 'BTCUSDT', side: 'BUY', price: '10', quantity: '2' },
    { symbol: 'ENAUSDT', side: 'SELL', price: '100', quantity: '9' },
  ];

  const next = applyForceOrders(state, orders, 'BTCUSDT');

  assert.equal(next.longLiqTotal, 120);
  assert.equal(next.shortLiqTotal, 20);
  assert.deepEqual(next.longLiqEvents, [orders[0]]);
  assert.deepEqual(next.shortLiqEvents, [orders[1]]);
});

test('appendOi appends matching symbol only and caps history', () => {
  const state = createSignalRuntimeState({
    oiDataHistory: Array.from({ length: 5000 }, (_, idx) => ({ id: idx })),
  });
  const oi = { symbol: 'BTCUSDT', openInterest: '123', collectedAt: '2026-05-12T00:00:00Z' };

  const next = appendOi(state, oi, 'BTCUSDT');
  const ignored = appendOi(next, { ...oi, symbol: 'ENAUSDT' }, 'BTCUSDT');

  assert.equal(next.oiDataHistory.length, 5000);
  assert.deepEqual(next.oiDataHistory.at(-1), oi);
  assert.equal(ignored, next);
});

test('appendCandle appends latest candle to chart history', () => {
  const state = createSignalRuntimeState({ candleHistory: [{ time: 1 }] });
  const candle = { time: 2 };

  assert.deepEqual(appendCandle(state, candle).candleHistory, [{ time: 1 }, candle]);
});

test('resetSignalRuntimeState clears volatile runtime data', () => {
  const state = createSignalRuntimeState({
    longEnergy: 1,
    shortEnergy: 2,
    longTrades: [{ id: 1 }],
    shortTrades: [{ id: 2 }],
    longLiqEvents: [{ id: 3 }],
    shortLiqEvents: [{ id: 4 }],
    longLiqTotal: 5,
    shortLiqTotal: 6,
    patterns: [{ id: 7 }],
    oiDataHistory: [{ id: 8 }],
    candleHistory: [{ id: 9 }],
    latestCandleTime: 10,
  });

  assert.deepEqual(resetSignalRuntimeState(state), createSignalRuntimeState());
});
