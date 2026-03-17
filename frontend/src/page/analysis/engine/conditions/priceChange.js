// [AGENT] T4-ANALYSIS: PRICE_CHANGE 조건 — abs((close-open)/open*100) 비교

/**
 * @param klineData  kline[]
 * @param idx        현재 봉 인덱스
 * @param unit       { type, op, value }
 */
export function evaluate(klineData, idx, unit) {
  const cur = klineData[idx];
  if (cur.open === 0) return false;

  const pct = Math.abs((cur.close - cur.open) / cur.open * 100);

  switch (unit.op) {
    case 'GT':  return pct >  unit.value;
    case 'GTE': return pct >= unit.value;
    case 'LT':  return pct <  unit.value;
    case 'LTE': return pct <= unit.value;
    default:    return false;
  }
}
