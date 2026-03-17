// [AGENT] T4-STEALTH: 방향 배지 (↑↓→—)
const BADGE_MAP = {
  up:       { label: '↑', color: '#00e887',               bg: 'rgba(0,232,135,0.1)' },
  down:     { label: '↓', color: '#ff3b5c',               bg: 'rgba(255,59,92,0.1)' },
  sideways: { label: '→', color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.06)' },
  pending:  { label: '—', color: 'rgba(255,255,255,0.2)', bg: 'transparent' },
};

export default function StealthBadge({ direction }) {
  const badge = BADGE_MAP[direction] ?? BADGE_MAP.pending;
  return (
    <span style={{
      fontSize:    '10px',
      fontWeight:  600,
      color:       badge.color,
      background:  badge.bg,
      padding:     '2px 5px',
      borderRadius: '3px',
      fontFamily:  "'Pretendard', sans-serif",
    }}>
      {badge.label}
    </span>
  );
}
