// [AGENT] T4-ANALYSIS: TIME_RANGE 조건 — UTC 시:분 범위 내 여부

/**
 * @param klineData  kline[]
 * @param idx        현재 봉 인덱스
 * @param unit       { type, startHour, startMinute, endHour, endMinute }
 */
export function evaluate(klineData, idx, unit) {
  const d      = new Date(klineData[idx].time);
  const hour   = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const cur    = hour * 60 + minute;
  const start  = (unit.startHour ?? 0) * 60 + (unit.startMinute ?? 0);
  const end    = (unit.endHour   ?? 23) * 60 + (unit.endMinute  ?? 59);

  if (start <= end) return cur >= start && cur <= end;
  // 자정 넘기는 범위 (예: 22:00 ~ 02:00)
  return cur >= start || cur <= end;
}
