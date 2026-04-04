// [AGENT] T4-STEALTH: 중앙 슬롯 오버레이 (상태 레이블 + 리셋 버튼)
const WATCHING_COLOR = 'var(--black-long)';
const SIGNAL_COLOR   = 'rgba(240,192,64,0.9)';
const WS_RECON_COLOR = 'rgba(255,160,50,0.9)';

export default function StealthWatcherPanel({ watchState, signalLabel, onReset }) {
  const isTriggered = watchState === 'TRIGGERED_LIVE' || watchState === 'LOCKED_AFTER_CLOSE';
  const isLocked    = watchState === 'LOCKED_AFTER_CLOSE';

  const getLabel = () => {
    if (watchState === 'WATCHING')      return '';
    if (watchState === 'RECONNECTING')  return '연결 중...';
    const typeLabel = signalLabel === 'B' ? '스텔스 거래' : '스텔스 의심';
    const icon = isLocked ? '🔒' : '⚡';
    return `${icon} ${typeLabel}`;
  };

  const getColor = () => {
    if (watchState === 'WATCHING')     return WATCHING_COLOR;
    if (watchState === 'RECONNECTING') return WS_RECON_COLOR;
    return SIGNAL_COLOR;
  };

  return (
    <div style={{
      position:       'absolute',
      inset:          0,
      display:        'flex',
      alignItems:     'flex-start',
      justifyContent: 'flex-end',
      padding:        '6px 8px',
      pointerEvents:  'none',
    }}>
      <style>{`
        @keyframes stealthPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      @keyframes stealthSpin {
        to { transform: rotate(360deg); }
      }
      `}</style>

      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        pointerEvents: 'none',
      }}>
        {watchState === 'RECONNECTING' && (
          <span style={{
            width:        12,
            height:       12,
            borderRadius: '50%',
            border:       '2px solid var(--black-border-strong)',
            borderTop:    `2px solid ${getColor()}`,
            animation:    'stealthSpin 0.9s linear infinite',
          }} />
        )}
        {getLabel() && (
          <span style={{
            fontSize:   '11px',
            fontWeight: 600,
            color:      getColor(),
            fontFamily: "'Pretendard', sans-serif",
            opacity:    isLocked ? 0.6 : 1,
          }}>
            {getLabel()}
          </span>
        )}
      </div>

      {isTriggered && (
        <button
          onClick={onReset}
          style={{
            position:        'absolute',
            right:           8,
            bottom:          8,
            fontSize:        '10px',
            color:           'var(--black-text-muted)',
            background:      'var(--black-border)',
            border:          '1px solid var(--black-border-strong)',
            borderRadius:    '3px',
            padding:         '2px 6px',
            cursor:          'pointer',
            fontFamily:      "'Pretendard', sans-serif",
            pointerEvents:   'auto',
          }}
        >
          리셋
        </button>
      )}
    </div>
  );
}
