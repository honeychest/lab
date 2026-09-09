const TRADE_BUFFER_SIZE = 20;
const LIQUIDATION_BUFFER_SIZE = 50;
const OI_BUFFER_SIZE = 5000;

export function createSignalRuntimeState(overrides = {}) {
  return {
    longEnergy: 0,
    shortEnergy: 0,
    longTrades: [],
    shortTrades: [],
    longLiqEvents: [],
    shortLiqEvents: [],
    longLiqTotal: 0,
    shortLiqTotal: 0,
    oiDataHistory: [],
    patterns: [],
    candleHistory: [],
    latestCandleTime: null,
    ...overrides,
  };
}

export function applyAggTrade(state, trade, symbol) {
  if (!trade || trade.symbol !== symbol) return state;

  const value = Number.parseFloat(trade.quantity) * Number.parseFloat(trade.price);
  if (trade.isBuyerMaker) {
    return {
      ...state,
      shortEnergy: state.shortEnergy + value,
      shortTrades: [...state.shortTrades, trade].slice(-TRADE_BUFFER_SIZE),
    };
  }

  return {
    ...state,
    longEnergy: state.longEnergy + value,
    longTrades: [...state.longTrades, trade].slice(-TRADE_BUFFER_SIZE),
  };
}

export function applyForceOrder(state, order, symbol) {
  if (!order || order.symbol !== symbol) return state;

  // 에너지는 순수 체결대금이라 청산을 빼지 않는다 — 청산 체결은 aggTrade 원본에 이미 포함돼 있다.
  const value = Number.parseFloat(order.quantity) * Number.parseFloat(order.price);
  if (order.side === 'SELL') {
    return {
      ...state,
      longLiqTotal: state.longLiqTotal + value,
      longLiqEvents: [order, ...state.longLiqEvents].slice(0, LIQUIDATION_BUFFER_SIZE),
    };
  }

  return {
    ...state,
    shortLiqTotal: state.shortLiqTotal + value,
    shortLiqEvents: [order, ...state.shortLiqEvents].slice(0, LIQUIDATION_BUFFER_SIZE),
  };
}

export function appendOi(state, oi, symbol) {
  if (!oi || oi.symbol !== symbol) return state;

  return {
    ...state,
    oiDataHistory: [...state.oiDataHistory, oi].slice(-OI_BUFFER_SIZE),
  };
}

export function appendCandle(state, candle) {
  return {
    ...state,
    candleHistory: [...state.candleHistory, candle],
  };
}

export function resetSignalRuntimeState() {
  return createSignalRuntimeState({
    longEnergy: 0,
    shortEnergy: 0,
    longTrades: [],
    shortTrades: [],
    longLiqEvents: [],
    shortLiqEvents: [],
    longLiqTotal: 0,
    shortLiqTotal: 0,
    patterns: [],
    oiDataHistory: [],
    candleHistory: [],
    latestCandleTime: null,
  });
}
