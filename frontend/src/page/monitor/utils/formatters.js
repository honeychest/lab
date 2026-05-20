export const parseDt = (dt) => {
    if (!dt) return null;
    if (Array.isArray(dt) && dt.length >= 6) {
        const [y, m, day, hh, mm, ss] = dt;
        const d = new Date(Number(y), Number(m) - 1, Number(day), Number(hh), Number(mm), Number(ss));
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(dt);
    return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtGb = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '--';
    return `${(n / (1024 ** 3)).toFixed(1)}GB`;
};

export const fmtCount = (n) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return '--';
    return Math.floor(v).toLocaleString('en-US');
};

export const fmtBytes = (bytes) => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '--';
    if (n < 1024) return `${n.toFixed(0)}B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}KB`;
    if (n < 1024 ** 3) return `${(n / (1024 ** 2)).toFixed(1)}MB`;
    if (n < 1024 ** 4) return `${(n / (1024 ** 3)).toFixed(1)}GB`;
    return `${(n / (1024 ** 4)).toFixed(2)}TB`;
};

export const fmtMem = (usedBytes, limitBytes) => {
    const u = Number(usedBytes);
    const l = Number(limitBytes);
    if (!Number.isFinite(u) || u < 0) return '--';
    if (Number.isFinite(l) && l > 0) return `${fmtBytes(u)} / ${fmtBytes(l)}`;
    return fmtBytes(u);
};

export const fmtTime = (dt) => {
    if (!dt) return '--:--:--';
    const d = parseDt(dt);
    if (!d) return '--:--:--';
    return d.toLocaleTimeString('ko-KR', { hour12: false });
};
