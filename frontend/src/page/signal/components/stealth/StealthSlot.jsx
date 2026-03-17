// [AGENT] T4-STEALTH: 개별 슬롯 컨테이너 (히스토리/center 공통) — 전 슬롯 캔들차트
import { useRef } from 'react';
import StealthChart from './StealthChart.jsx';
import StealthBadge from './StealthBadge.jsx';
import StealthWatcherPanel from './StealthWatcherPanel.jsx';

export default function StealthSlot({
  slotIndex,
  slotData,
  isCenter,
  watchState,
  signalLabel,
  liveCandle,
  tempHighlight,
  onReset,
}) {
  const slotRef = useRef(null);

  const highlights       = slotData?.events?.map((e) => ({ idx: e.idx, type: e.type })) ?? [];
  const tempHighlightType = isCenter ? signalLabel : null;

  const getBorderStyle = () => {
    if (!isCenter) return '1px solid rgba(255,255,255,0.1)';
    if (watchState === 'TRIGGERED_LIVE')     return '1px solid rgba(240,192,64,0.4)';
    if (watchState === 'LOCKED_AFTER_CLOSE') return '1px solid rgba(240,192,64,0.3)';
    return '1px solid rgba(255,255,255,0.1)';
  };

  const getBoxShadow = () => {
    if (!isCenter) return 'none';
    if (watchState === 'TRIGGERED_LIVE')     return '0 0 8px rgba(240,192,64,0.6)';
    if (watchState === 'LOCKED_AFTER_CLOSE') return '0 0 8px rgba(240,192,64,0.3)';
    return 'none';
  };

  return (
    <div
      ref={slotRef}
      style={{
        flex:           1,
        position:       'relative',
        display:        'flex',
        flexDirection:  'column',
        border:         getBorderStyle(),
        boxShadow:      getBoxShadow(),
        borderRadius:   '6px',
        overflow:       'hidden',
        minWidth:       0,
      }}
    >
      {slotData === null ? (
        <div style={{
          flex:           1,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontSize:   '11px',
            color:      'rgba(255,255,255,0.2)',
            fontFamily: "'Pretendard', sans-serif",
          }}>
            사례 없음
          </span>
        </div>
      ) : (
        <>
          {/* 슬롯 헤더 */}
          <div style={{
            height:         '24px',
            flexShrink:     0,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '0 6px',
          }}>
            <span style={{
              fontSize:   '11px',
              color:      'rgba(255,255,255,0.5)',
              fontFamily: "'Pretendard', sans-serif",
            }}>
              {slotData.date}
            </span>
            {!isCenter && slotData.events?.length > 0 && (
              <StealthBadge direction={slotData.events[0].direction} />
            )}
          </div>

          {/* 차트 영역 */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <StealthChart
              slotIndex={slotIndex}
              candles={slotData.candles}
              highlights={highlights}
              chartType="candle"
              liveCandle={isCenter ? liveCandle : null}
              tempHighlight={isCenter ? tempHighlight : false}
              tempHighlightType={tempHighlightType}
            />
          </div>
        </>
      )}

      {/* center 전용 오버레이 */}
      {isCenter && (
        <StealthWatcherPanel
          watchState={watchState}
          signalLabel={signalLabel}
          onReset={onReset}
        />
      )}
    </div>
  );
}
