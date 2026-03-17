// [AGENT] T4-ANALYSIS: DELTA 조건 — sign(POSITIVE/NEGATIVE) 또는 수치 비교

/**
 * @param klineData  kline[]
 * @param idx        현재 봉 인덱스
 * @param unit       { type, sign?, op?, value? }
 */
export function evaluate(klineData, idx, unit) {
  const delta = klineData[idx].delta;

  if (unit.sign === 'POSITIVE') return delta > 0;
  if (unit.sign === 'NEGATIVE') return delta < 0;

  switch (unit.op) {
    case 'GT':  return delta >  unit.value;
    case 'GTE': return delta >= unit.value;
    case 'LT':  return delta <  unit.value;
    case 'LTE': return delta <= unit.value;
    default:    return false;
  }
}
