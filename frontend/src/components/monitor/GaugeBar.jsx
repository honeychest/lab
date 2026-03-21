// [AGENT] 모니터링 게이지 바 (토큰 기반 색상, null 스켈레톤)
// 70%+: 테두리 / 80%+: 테두리+배경 / 90%+: 테두리+배경+번짐
import styles from './GaugeBar.module.css';

function clamp(v) {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
}

function colorFor(value) {
    if (value == null) return 'var(--monitor-primary-dim)';
    if (value < 70) return 'var(--monitor-gauge-ok)';
    if (value < 90) return 'var(--monitor-gauge-warn)';
    return 'var(--monitor-gauge-critical)';
}

function alertInfo(v) {
    if (v == null || v < 70) return { vars: {}, classes: [] };

    const isWarn     = v < 90;
    const color      = isWarn ? 'var(--monitor-gauge-warn)'     : 'var(--monitor-gauge-critical)';
    const bg         = isWarn ? 'rgba(202,138,4,0.06)'          : 'rgba(220,38,38,0.06)';
    const shadow     = isWarn ? 'rgba(202,138,4,0.35)'          : 'rgba(220,38,38,0.35)';

    const vars = { '--alert-color': color, '--alert-bg': bg, '--alert-shadow': shadow };
    const classes = [
        styles.cardBorder,                          // 70%+: 테두리
        v >= 80 ? styles.cardBg    : null,          // 80%+: 배경
        v >= 90 ? styles.cardPulse : null,          // 90%+: 번짐
    ].filter(Boolean);

    return { vars, classes };
}

export default function GaugeBar({ label, value, unit = '%' }) {
    const v = clamp(value);
    const display = v == null ? '--' : `${v.toFixed(0)}${unit}`;
    const color = colorFor(v);
    const { vars, classes } = alertInfo(v);

    return (
        <div className={[styles.card, ...classes].join(' ')} style={vars}>
            <div className={styles.top}>
                <span className={styles.label}>{label}</span>
                <span className={`${styles.value} ${v == null ? styles.valueSkeleton : ''}`}>{display}</span>
            </div>
            <div className={styles.track} aria-label={`${label} 게이지`}>
                <div
                    className={`${styles.fill} ${v == null ? styles.fillSkeleton : ''}`}
                    style={{
                        width: v == null ? '40%' : `${v}%`,
                        background: color,
                    }}
                />
            </div>
        </div>
    );
}
