// [AGENT] 모니터링 게이지 바 (토큰 기반 색상, null 스켈레톤)
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

export default function GaugeBar({ label, value, unit = '%' }) {
    const v = clamp(value);
    const display = v == null ? '--' : `${v.toFixed(0)}${unit}`;
    const color = colorFor(v);

    return (
        <div className={styles.card}>
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

