import styles from '../AdminPage.module.css';

export default function VisualSampleCard({ onOpen }) {
    return (
        <div className={styles.card}>
            <div className={styles.titleRow}>
                <div>
                    <div className={styles.title}>UI 샘플</div>
                    <div className={styles.subtitle}>공용 effect catalog</div>
                </div>
                <button
                    type="button"
                    className={`${styles.btn} ${styles.btnActive}`}
                    onClick={onOpen}
                    style={{ marginLeft: 'auto' }}
                >
                    샘플 보기
                </button>
            </div>
            <div className={styles.desc}>
                예: sample_live_spinner 를 특정 노드에 적용.
            </div>
        </div>
    );
}
