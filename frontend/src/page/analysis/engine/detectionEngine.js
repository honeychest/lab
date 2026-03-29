// [AGENT] T4-ANALYSIS: DetectionEngine — evaluate(klineData, conditionTree): number[]
// conditionTree 스펙: T3-ARCH §3 인터페이스 계약 참조
import { conditionRegistry } from './conditionRegistry.js';

/**
 * 단일 unit 평가
 */
function evalUnit(klineData, idx, unit) {
  const fn = conditionRegistry[unit.type];
  if (!fn) throw new Error(`Unknown condition type: ${unit.type}`);
  const result = fn(klineData, idx, unit);
  return unit.not ? !result : result;
}

/**
 * 그룹 내 units를 operator(AND/OR/NOT)로 평가
 */
function evalGroup(klineData, idx, group) {
  const { operator, units } = group;
  if (!units || units.length === 0) return false;

  if (operator === 'OR') {
    return units.some((unit) => evalUnit(klineData, idx, unit));
  }
  // AND (기본) / NOT(첫 unit만 평가 후 반전)
  if (operator === 'NOT') {
    return !evalUnit(klineData, idx, units[0]);
  }
  return units.every((unit) => evalUnit(klineData, idx, unit));
}

/**
 * conditionTree를 klineData에 적용하여 매칭 봉 인덱스 목록 반환
 * @param {Array}  klineData     — { time, open, high, low, close, volume, delta }[]
 * @param {Object} conditionTree — T3-ARCH §3 스펙
 * @returns {number[]} 매칭 봉 인덱스 목록
 */
export function evaluate(klineData, conditionTree) {
  const { groups, groupOperator } = conditionTree;
  if (!groups || groups.length === 0) return [];

  const results = [];

  for (let idx = 0; idx < klineData.length; idx++) {
    let matched;

    if (groupOperator === 'OR') {
      matched = groups.some((g) => evalGroup(klineData, idx, g));
    } else {
      // AND (기본)
      matched = groups.every((g) => evalGroup(klineData, idx, g));
    }

    if (matched) results.push(idx);
  }

  return results;
}
