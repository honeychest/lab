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

  const value = Number.parseFloat(order.quantity) * Number.parseFloat(order.price);
  if (order.side === 'SELL') {
    return {
      ...state,
      longEnergy: Math.max(0, state.longEnergy - value),
      longLiqTotal: state.longLiqTotal + value,
      longLiqEvents: [order, ...state.longLiqEvents].slice(0, LIQUIDATION_BUFFER_SIZE),
    };
  }

  return {
    ...state,
    shortEnergy: Math.max(0, state.shortEnergy - value),
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
