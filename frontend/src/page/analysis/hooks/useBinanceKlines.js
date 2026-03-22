// [AGENT] T4-ANALYSIS: 바이낸스 Kline(OHLCV) + 백엔드 delta 병합 조회
// 429 응답 시: Retry-After 파싱 후 1회 자동 재시도
// Binance klines limit=1000 제한으로 하루(1440분)를 2회 요청으로 분할 처리
import axios from 'axios';

const BINANCE_KLINE_URL = 'https://api.binance.com/api/v3/klines';
const BINANCE_KLINE_LIMIT = 720; // 1일 1440분을 2회로 분할 (max 1000 이내)

function dateToMs(dateStr) {
  return new Date(dateStr + 'T00:00:00Z').getTime();
}

function dateRangeDays(startDateStr, endDateStr) {
  const days = [];
  const cur  = new Date(startDateStr + 'T00:00:00Z');
  const end  = new Date(endDateStr   + 'T00:00:00Z');
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

async function fetchKlineChunk(symbolUsdt, startMs, endMs) {
  const url = `${BINANCE_KLINE_URL}?symbol=${symbolUsdt}&interval=1m&startTime=${startMs}&endTime=${endMs - 1}&limit=${BINANCE_KLINE_LIMIT}`;

  const doFetch = async () => {
    const res = await fetch(url);
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '5');
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      const retry = await fetch(url);
      if (!retry.ok) {
        const err = new Error(`바이낸스 API 오류: ${retry.statusText}`);
        err.status  = retry.status;
        err.message = retry.statusText;
        throw err;
      }
      return retry.json();
    }
    if (!res.ok) {
      const err = new Error(`바이낸스 API 오류: ${res.statusText}`);
      err.status  = res.status;
      err.message = res.statusText;
      throw err;
    }
    return res.json();
  };

  const raw = await doFetch();
  return raw.map((r) => ({
    time:   r[0],
    open:   Number(r[1]),
    high:   Number(r[2]),
    low:    Number(r[3]),
    close:  Number(r[4]),
    volume: Number(r[5]),
    delta:  0,
  }));
}

async function fetchOneDayKlines(symbolUsdt, dateStr) {
  const startMs  = dateToMs(dateStr);
  const endMs    = startMs + 86_400_000;
  const midMs    = startMs + BINANCE_KLINE_LIMIT * 60_000; // 720분 = 12시간 경계

  const [firstHalf, secondHalf] = await Promise.all([
    fetchKlineChunk(symbolUsdt, startMs, midMs),
    fetchKlineChunk(symbolUsdt, midMs,   endMs),
  ]);

  return [...firstHalf, ...secondHalf];
}

async function fetchDelta(symbol, startMs, endMs) {
  try {
    const res = await axios.get('/api/analysis/delta', {
      params: { symbol, startMs, endMs },
    });
    return res.data; // [{ timeMs, delta }]
  } catch (e) {
    console.warn('[useBinanceKlines] delta API 실패, delta=0으로 진행', e);
    return [];
  }
}

/**
 * 바이낸스 Kline + 백엔드 delta 병합
 * @param {'BTC'|'ENA'} symbol
 * @param {string} startDateStr 'YYYY-MM-DD'
 * @param {string} endDateStr   'YYYY-MM-DD'
 * @returns {Promise<kline[]>} { time(ms), open, high, low, close, volume, delta }
 */
export async function fetchKlines(symbol, startDateStr, endDateStr) {
  const symbolUsdt = symbol.toUpperCase() + 'USDT';
  const days       = dateRangeDays(startDateStr, endDateStr);
  const startMs    = dateToMs(startDateStr);
  const endMs      = dateToMs(endDateStr) + 86_400_000;

  const [klinesByDay, deltaList] = await Promise.all([
    Promise.all(days.map((d) => fetchOneDayKlines(symbolUsdt, d))),
    fetchDelta(symbol, startMs, endMs),
  ]);

  const klines = klinesByDay
    .flat()
    .sort((a, b) => a.time - b.time)
    .filter((c, i, arr) => i === 0 || c.time !== arr[i - 1].time);

  if (deltaList.length > 0) {
    const deltaMap = new Map(deltaList.map((d) => [d.timeMs, d.delta]));
    klines.forEach((c) => {
      const d = deltaMap.get(c.time);
      if (d !== undefined) c.delta = d;
    });
  }

  return klines;
}
