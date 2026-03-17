// [AGENT] T4-STEALTH: 중앙 슬롯 오버레이 (상태 레이블 + 리셋 버튼)
const WATCHING_COLOR = '#00e887';
const SIGNAL_COLOR   = 'rgba(240,192,64,0.9)';
const WS_RECON_COLOR = 'rgba(255,160,50,0.9)';

export default function StealthWatcherPanel({ watchState, signalLabel, onReset }) {
  const isTriggered = watchState === 'TRIGGERED_LIVE' || watchState === 'LOCKED_AFTER_CLOSE';
  const isLocked    = watchState === 'LOCKED_AFTER_CLOSE';

  const getLabel = () => {
    if (watchState === 'WATCHING')      return '● 감시중';
    if (watchState === 'RECONNECTING')  return '● 연결 중...';
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
      justifyContent: 'flex-start',
      padding:        '6px 8px',
      pointerEvents:  'none',
    }}>
      <style>{`
        @keyframes stealthPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>

      <span style={{
        fontSize:   '11px',
        fontWeight: 600,
        color:      getColor(),
        fontFamily: "'Pretendard', sans-serif",
        opacity:    isLocked ? 0.6 : 1,
        animation:  watchState === 'WATCHING' ? 'stealthPulse 1s ease-in-out infinite' : 'none',
        pointerEvents: 'none',
      }}>
        {getLabel()}
      </span>

      {isTriggered && (
        <button
          onClick={onReset}
          style={{
            position:        'absolute',
            right:           8,
            bottom:          8,
            fontSize:        '10px',
            color:           'rgba(255,255,255,0.5)',
            background:      'rgba(255,255,255,0.06)',
            border:          '1px solid rgba(255,255,255,0.12)',
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
