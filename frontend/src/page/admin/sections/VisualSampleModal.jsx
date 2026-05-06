import styles from '../AdminPage.module.css';
import { VISUAL_EFFECT_SAMPLES } from '@/shared/ui/samples/visualSamples';

export default function VisualSampleModal({ open, onClose }) {
    if (!open) return null;
    return (
        <div className={styles.sampleOverlay} onClick={onClose}>
            <div className={styles.sampleModal} onClick={(event) => event.stopPropagation()}>
                <div className={styles.titleRow}>
                    <div>
                        <div className={styles.title}>UI 샘플 카탈로그</div>
                        <div className={styles.subtitle}>class name으로 다른 페이지에서 재사용</div>
                    </div>
                    <button
                        type="button"
                        className={styles.btn}
                        onClick={onClose}
                    >
                        닫기
                    </button>
                </div>
                <div className={styles.sampleGrid}>
                    {VISUAL_EFFECT_SAMPLES.map(sample => (
                        <div key={sample.key} className={styles.sampleCard}>
                            <div className={styles.samplePreview}>
                                <span className={`${styles.sampleGlyph} ${sample.className}`} aria-hidden="true" />
                            </div>
                            <div className={styles.sampleMeta}>
                                <div className={styles.sampleKey}>{sample.key}</div>
                                <div className={styles.sampleLabel}>{sample.label}</div>
                                <div className={styles.desc}>{sample.intent}</div>
                                <code className={styles.sampleCode}>{sample.example}</code>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
