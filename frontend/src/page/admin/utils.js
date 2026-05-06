// AdminPage 섹션 전반에서 쓰는 순수 유틸리티.

export const fmtTtl = (ttlSeconds) => {
    const n = Number(ttlSeconds);
    if (!Number.isFinite(n) || n <= 0) return '만료';
    return `${Math.ceil(n / 60)}분 후`;
};

export function datetimeLocalToMs(s) {
    if (!s) return null;
    return new Date(s).getTime();
}

export function msToDatetimeLocal(ms) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fmtNum = n => n != null ? Number(n).toLocaleString() : '—';
export const fmtTime = ms => ms != null ? new Date(Number(ms)).toLocaleTimeString() : '—';
export const fmtDateTime = ms => ms != null ? new Date(Number(ms)).toLocaleString() : '—';

export const statusColor = (s) => ({ RUNNING: '#60a5fa', DONE: '#4ade80', ERROR: '#ef4444' }[s] ?? '#94a3b8');
