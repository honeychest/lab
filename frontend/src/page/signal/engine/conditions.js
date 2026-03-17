// [AGENT] T4-STEALTH: ConditionUnit 원자 조건 함수 — (cur, prev[], params) → boolean

/**
 * 거래량 >= mean(직전 N봉 거래량) × 배수
 */
export function volumeMultiplierCondition(cur, prev, params) {
  const avgVol = prev.reduce((s, c) => s + c.volume, 0) / prev.length;
  return cur.volume >= avgVol * params.volumeMultiplier;
}

/**
 * 현재봉.고가 < max(직전 N봉.고가) AND 현재봉.저가 > min(직전 N봉.저가)
 */
export function insideBarCondition(cur, prev) {
  const maxHigh = Math.max(...prev.map((c) => c.high));
  const minLow  = Math.min(...prev.map((c) => c.low));
  return cur.high < maxHigh && cur.low > minLow;
}

/**
 * abs(현재봉 몸통) < min(직전 N봉 몸통 절댓값)
 * 도지봉 전체 케이스는 notAllDojisCondition이 먼저 걸러줌
 */
export function bodyRatioCondition(cur, prev) {
  const prevBodies = prev.map((c) => Math.abs(c.close - c.open)).filter((b) => b > 0);
  const minBody    = Math.min(...prevBodies);
  return Math.abs(cur.close - cur.open) < minBody;
}

/**
 * 직전 N봉이 모두 도지봉(몸통=0)이면 false → Type B 탐지 제외 신호
 */
export function notAllDojisCondition(_cur, prev) {
  return !prev.every((c) => Math.abs(c.close - c.open) === 0);
}
