import shared from '../AdminPage.module.css';
import s from './VisualSampleModal.module.css';
import { VISUAL_EFFECT_SAMPLES } from '@/shared/ui/samples/visualSamples';

export default function VisualSampleModal({ open, onClose }) {
    if (!open) return null;
    return (
        <div className={s.overlay} onClick={onClose}>
            <div className={s.modal} onClick={(event) => event.stopPropagation()}>
                <div className={shared.titleRow}>
                    <div>
                        <div className={shared.title}>UI 샘플 카탈로그</div>
                        <div className={shared.subtitle}>class name으로 다른 페이지에서 재사용</div>
                    </div>
                    <button
                        type="button"
                        className={shared.btn}
                        onClick={onClose}
                    >
                        닫기
                    </button>
                </div>
                <div className={s.grid}>
                    {VISUAL_EFFECT_SAMPLES.map(sample => (
                        <div key={sample.key} className={s.card}>
                            <div className={s.preview}>
                                <span className={`${s.glyph} ${sample.className}`} aria-hidden="true" />
                            </div>
                            <div className={s.meta}>
                                <div className={s.key}>{sample.key}</div>
                                <div className={s.label}>{sample.label}</div>
                                <div className={shared.desc}>{sample.intent}</div>
                                <code className={s.code}>{sample.example}</code>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
