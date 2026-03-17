// [AGENT] T4-ANALYSIS: MiniChart 공용 컴포넌트로 교체 (StealthChart → MiniChart)
import { useRef } from 'react';
import MiniChart from '../../../../shared/ui/chart/MiniChart.jsx';
import { PALETTE } from '../../../analysis/palette.js';
import StealthBadge from './StealthBadge.jsx';
import StealthWatcherPanel from './StealthWatcherPanel.jsx';

const TYPE_COLOR = { A: 'rgba(240,192,64,0.9)', B: 'rgba(255,59,92,0.9)' };

export default function StealthSlot({
  slotData,
  isCenter,
  watchState,
  signalLabel,
  liveCandle,
  tempHighlight,
  onReset,
  paletteLevel = 'MID',
  isSearching = false,
  noMatch = false,
  templateName = '',
}) {
  const slotRef = useRef(null);

  const pal = PALETTE[paletteLevel] ?? PALETTE.MID;

  const highlights =
    slotData?.events?.map((e) => ({
      idx:   e.idx,
      color: pal.barColor,
    })) ?? [];

  const tempHighlightColor = isCenter ? pal.barColor : null;

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
      <style>{`
        @keyframes stealthBigSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      {!slotData ? (
        <>
          {noMatch ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.81rem',
              fontFamily: "'Pretendard', sans-serif",
            }}>
              일치하는 데이터가 없습니다.
            </div>
          ) : isSearching ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                border: '4px solid rgba(255,255,255,0.12)',
                borderTopColor: '#00e887',
                animation: 'stealthBigSpin 1s linear infinite',
              }} />
              <span style={{
                fontSize: '0.81rem',
                color: 'rgba(255,255,255,0.7)',
                fontFamily: "'Pretendard', sans-serif",
              }}>
                {(templateName || '템플릿')} 탐색중...
              </span>
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
        </>
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
            <MiniChart
              candles={slotData.candles}
              highlights={highlights}
              chartType="candle"
              liveCandle={isCenter ? liveCandle : null}
              tempHighlight={isCenter ? tempHighlight : false}
              tempHighlightColor={tempHighlightColor}
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
