// [AGENT] T4-STEALTH: PatternStrip — 헤더(STEALTH 라벨 + params 스피너) + StealthCaseViewer 호스팅
import { useState } from 'react';
import StealthCaseViewer from './stealth/StealthCaseViewer.jsx';

const DEFAULT_PARAMS = { volumeMultiplier: 10, refBars: 3 };

export default function PatternStrip({ symbol }) {
  const [params, setParams] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('stealth_params')) || DEFAULT_PARAMS;
    } catch {
      return DEFAULT_PARAMS;
    }
  });
  const [loading, setLoading] = useState(true);

  const handleParamsChange = (newParams) => {
    setParams(newParams);
    localStorage.setItem('stealth_params', JSON.stringify(newParams));
  };

  return (
    <div style={{
      height:          '100%',
      display:         'flex',
      flexDirection:   'column',
      backgroundColor: '#0e0f18',
      borderRadius:    '10px',
      border:          '1px solid rgba(255,255,255,0.06)',
      overflow:        'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        height:      '48px',
        flexShrink:  0,
        display:     'flex',
        alignItems:  'center',
        gap:         '12px',
        padding:     '0 16px',
      }}>
        <span style={{
          fontSize:      '11px',
          color:         'rgba(255,255,255,0.3)',
          letterSpacing: '1.5px',
          fontFamily:    "'Pretendard', sans-serif",
          userSelect:    'none',
        }}>
          STEALTH
        </span>

        {/* N봉 스피너 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: "'Pretendard', sans-serif" }}>
            N봉
          </span>
          <input
            type="number"
            min={1}
            max={20}
            step={1}
            value={params.refBars}
            disabled={loading}
            onChange={(e) =>
              handleParamsChange({
                ...params,
                refBars: Math.min(20, Math.max(1, Number(e.target.value))),
              })
            }
            style={{
              width:       '48px',
              background:  'transparent',
              border:      '1px solid rgba(255,255,255,0.15)',
              color:       'rgba(255,255,255,0.8)',
              borderRadius: '4px',
              padding:     '2px 4px',
              fontSize:    '12px',
              textAlign:   'center',
              fontFamily:  "'Pretendard', sans-serif",
            }}
          />
        </label>

        {/* 배수 스피너 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: "'Pretendard', sans-serif" }}>
            배수
          </span>
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            value={params.volumeMultiplier}
            disabled={loading}
            onChange={(e) =>
              handleParamsChange({
                ...params,
                volumeMultiplier: Math.min(50, Math.max(1, Number(e.target.value))),
              })
            }
            style={{
              width:       '48px',
              background:  'transparent',
              border:      '1px solid rgba(255,255,255,0.15)',
              color:       'rgba(255,255,255,0.8)',
              borderRadius: '4px',
              padding:     '2px 4px',
              fontSize:    '12px',
              textAlign:   'center',
              fontFamily:  "'Pretendard', sans-serif",
            }}
          />
        </label>

        <div style={{ flex: 1 }} />
      </div>

      {/* StealthCaseViewer */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <StealthCaseViewer
          symbol={symbol}
          params={params}
          onLoadingChange={setLoading}
        />
      </div>
    </div>
  );
}
