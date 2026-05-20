import styles from '../MonitorPage.module.css';

export default function WaitOverlay() {
    return (
        <div className={styles.waitOverlay} aria-live="polite">
            <div className={styles.waitOverlayBox}>
                <div className={styles.waitTitle}>
                    데이터 수신중
                    <span className={styles.waitDots} aria-hidden="true">
                        <span className={styles.waitDot} />
                        <span className={styles.waitDot} />
                        <span className={styles.waitDot} />
                    </span>
                </div>
            </div>
        </div>
    );
}
