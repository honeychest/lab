// [AGENT] T4-ANALYSIS: 토스트 알림 — 우측 하단 고정, 자동 닫힘
import { useEffect } from 'react';

const AUTO_CLOSE_MS = { success: 3000, error: 0, delete: 2000 };

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const ms = AUTO_CLOSE_MS[type] ?? 3000;
    if (ms === 0) return;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [message, type, onClose]);

  return (
    <div style={{
      position:     'fixed',
      bottom:       '24px',
      right:        '24px',
      zIndex:       200,
      background:   'rgba(14,15,24,0.96)',
      border:       '1px solid rgba(255,255,255,0.12)',
      borderRadius: '8px',
      padding:      '12px 16px',
      fontSize:     '13px',
      color:        'rgba(255,255,255,0.85)',
      fontFamily:   "'Pretendard', sans-serif",
      maxWidth:     '320px',
      display:      'flex',
      alignItems:   'center',
      gap:          '10px',
      boxShadow:    '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background:  'transparent',
          border:      'none',
          color:       'rgba(255,255,255,0.4)',
          cursor:      'pointer',
          fontSize:    '14px',
          padding:     '0 2px',
          lineHeight:  1,
          fontFamily:  "'Pretendard', sans-serif",
        }}
      >×</button>
    </div>
  );
}
