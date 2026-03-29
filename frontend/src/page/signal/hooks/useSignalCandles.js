// [AGENT] T4-STEALTH: 날짜별 캔들 / 날짜 목록 비동기 유틸 함수
import apiClient from '@/api/apiClient.js';

/**
 * 날짜별 5분봉 캔들 조회.
 * @param symbol  string  — 심볼 (예: 'BTCUSDT')
 * @param date    string  — 'YYYY-MM-DD' (KST 거래일 = UTC 날짜)
 * @param overlap number  — 직전 overlap 봉 수 (고정 20 권장)
 * @returns Promise<candle[]>  — isOverlap 플래그 포함. 시간 오름차순.
 */
export async function fetchDayCandles(symbol, date, overlap = 20) {
  const res = await apiClient.get(
    `/api/signal/candles?symbol=${symbol}&type=5m&date=${date}&overlap=${overlap}`
  );
  return res.data;
}

/**
 * 심볼의 보유 날짜 목록 조회.
 * @returns Promise<string[]>  — 'YYYY-MM-DD' 배열, 최신순
 */
export async function fetchCandleDates(symbol) {
  const res = await apiClient.get(`/api/signal/candles/dates?symbol=${symbol}`);
  return res.data.dates;
}
