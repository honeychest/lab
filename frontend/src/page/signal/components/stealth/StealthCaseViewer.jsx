// [AGENT] T4-STEALTH: 메인 컨테이너 — 상태 머신 + 데이터 캐시 + WS + 슬롯 배치
import { useState, useEffect, useRef } from 'react';
import { detectAB } from '../../engine/detectionEngine.js';
import {
  volumeMultiplierCondition,
  insideBarCondition,
  bodyRatioCondition,
  notAllDojisCondition,
} from '../../engine/conditions.js';
import { fetchDayCandles, fetchCandleDates } from '../../hooks/useSignalCandles.js';
import StealthSlot from './StealthSlot.jsx';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const FILL_ORDER  = [3, 2, 1, 0];

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function todayDateStr() {
  const d   = new Date();
  const y   = d.getUTCFullYear();
  const m   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m)}/${d}`;
}

function calcDirection(candles, idx, dateStr, todayStr) {
  if (dateStr >= todayStr) return 'pending';
  const dayLastClose = candles[candles.length - 1]?.close ?? 0;
  const lo = Math.min(candles[idx].open, candles[idx].close);
  const hi = Math.max(candles[idx].open, candles[idx].close);
  if (dayLastClose >= lo && dayLastClose <= hi) return 'sideways';
  if (dayLastClose > hi)  return 'up';
  return 'down';
}

function buildDayEntry(dateStr, rawCandles, params) {
  const overlaps = rawCandles.filter((c) => c.isOverlap);
  const candles  = rawCandles.filter((c) => !c.isOverlap);

  const allForDetect = [...overlaps, ...candles];
  const { typeA, typeB } = detectAB(allForDetect, params);

  const overlapCount = overlaps.length;
  const todayStr     = todayDateStr();

  const events = [
    ...typeA.filter((i) => i >= overlapCount).map((i) => ({
      idx:       i - overlapCount,
      type:      'A',
      direction: calcDirection(candles, i - overlapCount, dateStr, todayStr),
    })),
    ...typeB.filter((i) => i >= overlapCount).map((i) => ({
      idx:       i - overlapCount,
      type:      'B',
      direction: calcDirection(candles, i - overlapCount, dateStr, todayStr),
    })),
  ].sort((a, b) => a.idx - b.idx);

  return {
    dateStr,
    date:     formatDate(dateStr),
    candles,
    overlaps,
    events,
  };
}

function buildSlots(cache, todayStr, hDates) {
  const slots = Array(5).fill(null);

  const todayEntry = cache.get(todayStr);
  slots[4] = todayEntry
    ? { ...todayEntry }
    : { dateStr: todayStr, date: formatDate(todayStr), candles: [], overlaps: [], events: [] };

  hDates.forEach((dateStr, i) => {
    const entry = cache.get(dateStr);
    if (entry && i < FILL_ORDER.length) {
      slots[FILL_ORDER[i]] = { ...entry };
    }
  });

  return slots;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function StealthCaseViewer({ symbol, params, onLoadingChange }) {
  const [cache, setCache]               = useState(new Map());
  const [slots, setSlots]               = useState(Array(5).fill(null));
  const [historyDates, setHistoryDates] = useState([]);
  const [todayDate, setTodayDate]       = useState('');
  const [watchState, setWatchState]     = useState('WATCHING');
  const [signalLabel, setSignalLabel]   = useState(null);
  const [liveCandle, setLiveCandle]     = useState(null);
  const [tempHighlight, setTempHighlight] = useState(false);
  const [restError, setRestError]       = useState(false);

  const cacheRef        = useRef(new Map());
  const paramsRef       = useRef(params);
  const watchStateRef   = useRef('WATCHING');
  const todayDateRef    = useRef('');
  const historyDatesRef = useRef([]);
  const wsRef           = useRef(null);
  const reconnectTimer  = useRef(null);
  const dateCheckTimer  = useRef(null);

  // state → ref 동기화
  useEffect(() => { paramsRef.current       = params;       });
  useEffect(() => { watchStateRef.current   = watchState;   });
  useEffect(() => { todayDateRef.current    = todayDate;    });
  useEffect(() => { historyDatesRef.current = historyDates; });
  useEffect(() => {
    cacheRef.current = cache;
  });

  // ─── 초기 로드 / symbol 변경 ────────────────────────────────────────────────

  useEffect(() => {
    if (!symbol) return;

    onLoadingChange(true);
    setRestError(false);
    setWatchState('WATCHING');
    watchStateRef.current = 'WATCHING';
    setSignalLabel(null);
    setLiveCandle(null);
    setTempHighlight(false);

    const newMap = new Map();
    cacheRef.current = newMap;
    setCache(newMap);
    setSlots(Array(5).fill(null));

    const today = todayDateStr();
    setTodayDate(today);
    todayDateRef.current = today;

    let cancelled = false;

    const load = async () => {
      let dates;
      try {
        dates = await fetchCandleDates(symbol);
      } catch (err) {
        if (!cancelled) {
          console.error('[StealthCaseViewer] fetchCandleDates failed', err);
          setRestError(true);
          onLoadingChange(false);
        }
        return;
      }

      if (cancelled) return;

      const hDates = dates.filter((d) => d !== today).slice(0, 4);
      setHistoryDates(hDates);
      historyDatesRef.current = hDates;

      onLoadingChange(false);

      const todayInDates  = dates.includes(today);
      const targetDates   = todayInDates ? [today, ...hDates] : [...hDates];

      for (const date of targetDates) {
        if (cancelled) break;
        try {
          const rawCandles = await fetchDayCandles(symbol, date, 20);
          if (cancelled) break;
          const dayEntry = buildDayEntry(date, rawCandles, paramsRef.current);
          const newCache = new Map(cacheRef.current);
          newCache.set(date, dayEntry);
          cacheRef.current = newCache;
          setCache(new Map(newCache));
          if (watchStateRef.current !== 'TRIGGERED_LIVE') {
            setSlots(buildSlots(newCache, todayDateRef.current, historyDatesRef.current));
          }
        } catch (err) {
          if (!cancelled) console.error('[StealthCaseViewer] fetchDayCandles failed', date, err);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // ─── WS 연결 (symbol 변경 시 재연결) ────────────────────────────────────────

  useEffect(() => {
    if (!symbol) return;

    clearTimeout(reconnectTimer.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const url = `${WS_PROTOCOL}//${window.location.host}/ws/candle/5m?symbol=${symbol}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyed) return;
        if (watchStateRef.current !== 'LOCKED_AFTER_CLOSE') {
          watchStateRef.current = 'WATCHING';
          setWatchState('WATCHING');
        }
      };

      ws.onmessage = (e) => {
        if (destroyed) return;
        try {
          const msg = JSON.parse(e.data);
          handleWsMessage(msg);
        } catch {
          // 파싱 실패 무시
        }
      };

      ws.onclose = () => {
        if (destroyed) return;
        watchStateRef.current = 'RECONNECTING';
        setWatchState('RECONNECTING');
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => { ws.close(); };
    };

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol]);

  // ─── WS 메시지 처리 ──────────────────────────────────────────────────────────

  const handleWsMessage = (msg) => {
    const timeMs  = new Date(msg.time).getTime();
    const unixSec = Math.floor(timeMs / 1000);

    if (!msg.is_closed) {
      // 진행 중 봉
      setLiveCandle({
        time:  unixSec,
        open:  msg.open,
        high:  msg.high,
        low:   msg.low,
        close: msg.close,
      });

      // 실시간 단일 봉 조건 체크
      const today      = todayDateRef.current;
      const todayEntry = cacheRef.current.get(today) ?? { candles: [], overlaps: [] };
      const p          = paramsRef.current;

      const contextCandles = [
        ...todayEntry.overlaps,
        ...todayEntry.candles,
        { time: timeMs, open: msg.open, high: msg.high, low: msg.low, close: msg.close, volume: msg.volume },
      ];

      const idx = contextCandles.length - 1;
      if (idx < p.refBars) return;

      const prev = contextCandles.slice(idx - p.refBars, idx);
      const cur  = contextCandles[idx];

      const isB = notAllDojisCondition(cur, prev, p) &&
                  volumeMultiplierCondition(cur, prev, p) &&
                  bodyRatioCondition(cur, prev, p);
      const isA = !isB &&
                  volumeMultiplierCondition(cur, prev, p) &&
                  insideBarCondition(cur, prev, p);
      const detectedType = isB ? 'B' : isA ? 'A' : null;

      if (watchStateRef.current === 'WATCHING' && detectedType !== null) {
        watchStateRef.current = 'TRIGGERED_LIVE';
        setWatchState('TRIGGERED_LIVE');
        setSignalLabel(detectedType);
        setTempHighlight(true);

        // 히스토리 슬롯 초기화: center만 유지
        const freshSlots = Array(5).fill(null);
        freshSlots[4] = buildSlots(cacheRef.current, today, historyDatesRef.current)[4];
        setSlots(freshSlots);
      }

      if (watchStateRef.current === 'TRIGGERED_LIVE' && detectedType === null) {
        watchStateRef.current = 'WATCHING';
        setWatchState('WATCHING');
        setSignalLabel(null);
        setTempHighlight(false);
        setSlots(buildSlots(cacheRef.current, today, historyDatesRef.current));
      }

    } else {
      // 봉 마감
      const today = todayDateRef.current;
      const newCandle = {
        time:   timeMs,
        open:   msg.open,
        high:   msg.high,
        low:    msg.low,
        close:  msg.close,
        volume: msg.volume,
        delta:  msg.delta ?? 0,
      };

      const existing = cacheRef.current.get(today) ?? {
        dateStr:  today,
        date:     formatDate(today),
        candles:  [],
        overlaps: [],
        events:   [],
      };

      const updatedCandles = [...existing.candles, newCandle];
      const rawForDetect   = [
        ...existing.overlaps.map((c) => ({ ...c, isOverlap: true })),
        ...updatedCandles.map((c)    => ({ ...c, isOverlap: false })),
      ];
      const newTodayEntry = buildDayEntry(today, rawForDetect, paramsRef.current);

      const newCache = new Map(cacheRef.current);
      newCache.set(today, newTodayEntry);
      cacheRef.current = newCache;
      setCache(new Map(newCache));

      if (watchStateRef.current === 'TRIGGERED_LIVE') {
        watchStateRef.current = 'LOCKED_AFTER_CLOSE';
        setWatchState('LOCKED_AFTER_CLOSE');
        setTempHighlight(false);
      }

      setSlots(buildSlots(newCache, today, historyDatesRef.current));
      setLiveCandle(null);
    }
  };

  // ─── params 변경 시 전체 재탐지 ─────────────────────────────────────────────

  useEffect(() => {
    paramsRef.current = params;
    if (cacheRef.current.size === 0) return;

    const newCache = new Map();
    for (const [dateStr, entry] of cacheRef.current) {
      const rawCandles = [
        ...entry.overlaps.map((c) => ({ ...c, isOverlap: true })),
        ...entry.candles.map((c)  => ({ ...c, isOverlap: false })),
      ];
      newCache.set(dateStr, buildDayEntry(dateStr, rawCandles, params));
    }
    cacheRef.current = newCache;
    setCache(new Map(newCache));
    setSlots(buildSlots(newCache, todayDateRef.current, historyDatesRef.current));
  }, [params]);

  // ─── 날짜 전환 감지 (UTC 자정 = KST 09:00) ───────────────────────────────────

  useEffect(() => {
    if (!symbol) return;

    dateCheckTimer.current = setInterval(async () => {
      const newToday = todayDateStr();
      if (newToday <= todayDateRef.current) return;

      setTodayDate(newToday);
      todayDateRef.current = newToday;

      setWatchState('WATCHING');
      watchStateRef.current = 'WATCHING';
      setSignalLabel(null);
      setLiveCandle(null);
      setTempHighlight(false);

      try {
        const dates  = await fetchCandleDates(symbol);
        const hDates = dates.filter((d) => d !== newToday).slice(0, 4);
        setHistoryDates(hDates);
        historyDatesRef.current = hDates;

        fetchDayCandles(symbol, newToday, 20)
          .then((rawCandles) => {
            const dayEntry = buildDayEntry(newToday, rawCandles, paramsRef.current);
            const newCache = new Map(cacheRef.current);
            newCache.set(newToday, dayEntry);
            cacheRef.current = newCache;
            setCache(new Map(newCache));
            setSlots(buildSlots(newCache, newToday, hDates));
          })
          .catch((err) => console.error('[StealthCaseViewer] date transition fetch failed', err));
      } catch (err) {
        console.error('[StealthCaseViewer] date transition fetchCandleDates failed', err);
      }
    }, 60_000);

    return () => clearInterval(dateCheckTimer.current);
  }, [symbol]);

  // ─── 리셋 ────────────────────────────────────────────────────────────────────

  const handleReset = () => {
    watchStateRef.current = 'WATCHING';
    setWatchState('WATCHING');
    setSignalLabel(null);
    setTempHighlight(false);

    const today      = todayDateRef.current;
    const todayEntry = cacheRef.current.get(today);
    if (todayEntry) {
      const cleared  = { ...todayEntry, events: [] };
      const newCache = new Map(cacheRef.current);
      newCache.set(today, cleared);
      cacheRef.current = newCache;
      setCache(new Map(newCache));
      setSlots(buildSlots(newCache, today, historyDatesRef.current));
    }
  };

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  if (restError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: "'Pretendard', sans-serif" }}>
          데이터를 불러오지 못했습니다
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', gap: '4px' }}>
      {slots.map((slotData, i) => (
        <StealthSlot
          key={i}
          slotData={slotData}
          slotIndex={i}
          isCenter={i === 4}
          watchState={i === 4 ? watchState : undefined}
          signalLabel={i === 4 ? signalLabel : undefined}
          liveCandle={i === 4 ? liveCandle : undefined}
          tempHighlight={i === 4 ? tempHighlight : false}
          onReset={i === 4 ? handleReset : undefined}
        />
      ))}
    </div>
  );
}
