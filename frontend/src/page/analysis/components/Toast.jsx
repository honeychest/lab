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
    <div className="analysis-toast">
      <span className="analysis-toast__msg">{message}</span>
      <button
        onClick={onClose}
        className="analysis-btn--icon analysis-btn--icon-md"
      >×</button>
    </div>
  );
}
