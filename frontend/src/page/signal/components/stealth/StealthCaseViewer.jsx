// [AGENT] T4-STEALTH: 메인 컨테이너 — 상태 머신 + 데이터 캐시 + WS + 슬롯 배치
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import StealthSlot from './StealthSlot.jsx';

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const MAX_SLOTS   = 5;

function formatDate(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${parseInt(m, 10)}/${d}`;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function StealthCaseViewer({
  symbol,
  templateId,
  templateName,
  paletteLevel = 'MID',
  onLoadingChange,
}) {
  const [slots, setSlots]               = useState(Array(MAX_SLOTS).fill(null));
  const [, setEntries]                  = useState([]);
  const [watchState, setWatchState]     = useState('WATCHING');
  const [signalLabel, setSignalLabel]   = useState(null);
  const [liveCandle, setLiveCandle]     = useState(null);
  const [tempHighlight, setTempHighlight] = useState(false);
  const [restError, setRestError]       = useState(false);
  const [isSearching, setIsSearching]   = useState(false);
  const [noMatch, setNoMatch]           = useState(false);

  const watchStateRef   = useRef('WATCHING');
  const wsRef           = useRef(null);
  const reconnectTimer  = useRef(null);
  const searchDoneTimer = useRef(null);

  // state → ref 동기화
  useEffect(() => { watchStateRef.current   = watchState;   }, [watchState]);

  // ─── 초기 로드 / symbol 변경 ────────────────────────────────────────────────

  useEffect(() => {
    if (!symbol || !templateId) return;

    onLoadingChange(true);
    setRestError(false);
    setIsSearching(true);
    setNoMatch(false);
    setWatchState('WATCHING');
    watchStateRef.current = 'WATCHING';
    setSignalLabel(null);
    setLiveCandle(null);
    setTempHighlight(false);
    setSlots(Array(MAX_SLOTS).fill(null));
    setEntries([]);

    let cancelled = false;

    const load = async () => {
      try {
        const res = await axios.get(`/api/analysis/templates/${templateId}/signals`, {
          params: { symbol, days: 10 },
        });
        if (cancelled) return;
        const list = Array.isArray(res.data?.entries) ? res.data.entries : [];
        setEntries(list);

        if (list.length === 0) {
          onLoadingChange(false);
          setIsSearching(false);
          setNoMatch(true);
          return;
        }

        const slotsTmp = Array(MAX_SLOTS).fill(null);
        setSlots(slotsTmp);
        const totalSlots = Math.min(list.length, MAX_SLOTS);
        let filledCount = 0;

        list.slice(0, MAX_SLOTS).forEach((entry, idx) => {
          setTimeout(() => {
            if (cancelled) return;
            setSlots((prev) => {
              const next = [...prev];
              const slotIndex = MAX_SLOTS - 1 - idx; // 가장 먼저 찾아진 날짜가 맨 우측
              next[slotIndex] = {
                ...entry,
                date: formatDate(entry.dateStr),
              };
              return next;
            });
            filledCount += 1;
            if (filledCount === totalSlots) {
              onLoadingChange(false);
            }
          }, idx * 1000);
        });

        // 남은 슬롯에 대한 "탐색 완료" 처리: 매칭된 슬롯 수와 관계없이 10일 조회는 이미 끝난 상태
        if (searchDoneTimer.current) clearTimeout(searchDoneTimer.current);
        searchDoneTimer.current = setTimeout(() => {
          if (cancelled) return;
          setIsSearching(false);
          setNoMatch(true);
        }, totalSlots * 1000);
      } catch (err) {
        if (!cancelled) {
          console.error('[StealthCaseViewer] /api/analysis/templates/{id}/signals failed', err);
          setRestError(true);
          onLoadingChange(false);
          setIsSearching(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (searchDoneTimer.current) {
        clearTimeout(searchDoneTimer.current);
        searchDoneTimer.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, templateId]);

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
      // 진행 중 봉: 센터 슬롯 실시간 캔들만 갱신
      setLiveCandle({
        time:  unixSec,
        open:  msg.open,
        high:  msg.high,
        low:   msg.low,
        close: msg.close,
      });
    } else {
      // 봉 마감: 상태 전이만 처리
      if (watchStateRef.current === 'TRIGGERED_LIVE') {
        watchStateRef.current = 'LOCKED_AFTER_CLOSE';
        setWatchState('LOCKED_AFTER_CLOSE');
        setTempHighlight(false);
      }

      setLiveCandle(null);
    }
  };

  // 날짜 전환 감지는 템플릿 기반 API에서 재호출로 처리 (별도 타이머 생략)

  // ─── 리셋 ────────────────────────────────────────────────────────────────────

  const handleReset = () => {
    watchStateRef.current = 'WATCHING';
    setWatchState('WATCHING');
    setSignalLabel(null);
    setTempHighlight(false);

    setSlots((prev) => prev.map((slot, idx) => (
      idx === MAX_SLOTS - 1 && slot
        ? { ...slot, events: [] }
        : slot
    )));
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
          paletteLevel={paletteLevel}
          isSearching={isSearching}
          noMatch={noMatch}
          templateName={templateName}
        />
      ))}
    </div>
  );
}
