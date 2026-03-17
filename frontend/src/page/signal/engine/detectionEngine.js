// [AGENT] T4-STEALTH: 범용 DetectionEngine — detect(candles[], conditions[], params) + detectAB(candles[], params)
import * as cond from './conditions.js';
export { cond };

/**
 * @param candles    candle[] — 전체 배열 (시간 오름차순)
 * @param conditions Function[] — ConditionUnit 배열 (AND 평가)
 * @param params     { volumeMultiplier, refBars }
 * @returns number[] — 조건 충족 봉의 인덱스 목록
 */
export function detect(candles, conditions, params) {
  const results = [];
  for (let idx = params.refBars; idx < candles.length; idx++) {
    const prev = candles.slice(idx - params.refBars, idx);
    const cur  = candles[idx];
    if (conditions.every((fn) => fn(cur, prev, params))) {
      results.push(idx);
    }
  }
  return results;
}

/**
 * A/B 각각 detect 후 병합. 동시 충족 봉은 B로 분류.
 * @returns { typeA: number[], typeB: number[] }
 */
export function detectAB(candles, params) {
  const { volumeMultiplierCondition: volCond,
          insideBarCondition:        insideCond,
          bodyRatioCondition:        bodyCond,
          notAllDojisCondition:      notDojiCond } = cond;

  const typeAIdxs = detect(candles, [volCond, insideCond],         params);
  const typeBIdxs = detect(candles, [notDojiCond, volCond, bodyCond], params);

  const bSet  = new Set(typeBIdxs);
  const typeA = typeAIdxs.filter((i) => !bSet.has(i));

  return { typeA, typeB: typeBIdxs };
}
