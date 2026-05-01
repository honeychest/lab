import { dlog } from '@/global/chs';

export default function SupportFlowStrip({ title = '보조 흐름', flows = [], onInfoOpen }) {
    if (flows.length === 0) return null;

    const handleOpen = (flow) => {
        if (flow.disabled) return;
        if (flow.onClick) {
            dlog(1, `SupportFlowStrip.action — ${flow.label} 보조 흐름 액션 실행`);
            flow.onClick();
            return;
        }

        dlog(1, `SupportFlowStrip.open — ${flow.label} 보조 흐름 설명 팝업`);
        dlog(flow.stage ?? 2, flow.handoffLog ?? `SupportFlowStrip.open — ${flow.label} 상세 구현 회수 지점`, flow.key);
        onInfoOpen?.({
            title: flow.label,
            stageLabel: flow.stageLabel,
            summary: flow.summary,
            bullets: flow.bullets,
        });
    };

    return (
        <div className="logistics-support-strip" aria-label={title}>
            <div className="logistics-support-label">{title}</div>
            <div className="logistics-support-items">
                {flows.map(flow => (
                    <button
                        key={flow.key}
                        type="button"
                        className={`logistics-support-chip${flow.variant ? ` variant-${flow.variant}` : ''}`}
                        disabled={flow.disabled}
                        onClick={() => handleOpen(flow)}
                    >
                        <span className="logistics-support-chip-title">{flow.label}</span>
                        <span className="logistics-support-chip-meta">{flow.meta}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
