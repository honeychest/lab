// [AGENT] T4-ANALYSIS: VOLUME_SPIKE 조건 — 직전 20봉 평균 거래량 대비 배수 비교 (20봉 고정)

const REF_BARS = 20;

/**
 * @param klineData  kline[]
 * @param idx        현재 봉 인덱스
 * @param unit       { type, op, value }
 */
export function evaluate(klineData, idx, unit) {
  if (idx < REF_BARS) return false;

  const cur  = klineData[idx];
  const prev = klineData.slice(idx - REF_BARS, idx);
  const avg  = prev.reduce((s, c) => s + c.volume, 0) / REF_BARS;
  if (avg === 0) return false;

  const ratio = cur.volume / avg;

  switch (unit.op) {
    case 'GT':  return ratio >  unit.value;
    case 'GTE': return ratio >= unit.value;
    case 'LT':  return ratio <  unit.value;
    case 'LTE': return ratio <= unit.value;
    default:    return false;
  }
}
