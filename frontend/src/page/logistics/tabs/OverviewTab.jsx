import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import {
    OMS_STAGES,
    INBOUND_STAGES,
    WMS_OUT_STAGES,
    TMS_STAGES,
    STAGE_LABELS,
} from '@/domain/logistics/common/stages';

function stageCount(tasks, stage) {
    return tasks.filter(task => task.currentStage === stage).length;
}

function domainTasks(tasks, stages) {
    return tasks.filter(task => stages.includes(task.currentStage));
}

function hottestStage(tasks, stages) {
    const ranked = stages.map(stage => ({
        stage,
        count: stageCount(tasks, stage),
    }));

    return ranked.sort((left, right) => right.count - left.count)[0] ?? { stage: stages[0], count: 0 };
}

function stalledCount(tasks) {
    return tasks.filter(task => task.status === 'paused').length;
}

function failedCount(tasks) {
    return tasks.filter(task => task.status === 'failed').length;
}

function buildAxisCard(tasks, domain, stages, caption) {
    const scopedTasks = domainTasks(tasks, stages);
    const hotspot = hottestStage(scopedTasks, stages);
    const failed = failedCount(scopedTasks);
    const paused = stalledCount(scopedTasks);
    const active = scopedTasks.filter(task => task.status === 'active').length;
    const load = scopedTasks.length;

    let riskTone = 'normal';
    let riskLabel = '정상';
    let riskText = '뚜렷한 병목 신호 없음';

    if (failed > 0) {
        riskTone = 'danger';
        riskLabel = '실패 대응 필요';
        riskText = `${failed}건이 조치 대기 상태`;
    } else if (paused > 0 || hotspot.count >= 3) {
        riskTone = 'warn';
        riskLabel = '정체 주의';
        riskText = paused > 0
            ? `${paused}건이 멈춤 상태`
            : `${STAGE_LABELS[hotspot.stage]} 구간에 ${hotspot.count}건 집중`;
    }

    return {
        domain,
        caption,
        load,
        active,
        hotspot,
        failed,
        paused,
        riskTone,
        riskLabel,
        riskText,
    };
}

export default function OverviewTab() {
    const { tasks, eventCount } = useLogisticsSnapshot();

    const axisCards = [
        buildAxisCard(tasks, 'OMS', OMS_STAGES, '접수, 검증, WMS 이관 진입'),
        buildAxisCard(tasks, 'WMS', [...INBOUND_STAGES, ...WMS_OUT_STAGES], '입고 보조축 + 출고 주 흐름'),
        buildAxisCard(tasks, 'TMS', TMS_STAGES, '배차, 상차, 배송, 인도'),
    ];

    return (
        <section className="logistics-tab-shell">
            <div className="logistics-tab-header">
                <div>
                    <h2 className="logistics-tab-title">3축 개요</h2>
                    <p className="logistics-tab-copy" style={{ display: 'block' }}>
                        전체 흐름 요약보다 어디가 막히는지 먼저 읽는 탭. 축별 적체, 실패, 집중 단계를 바로 본다.
                    </p>
                </div>
                <div className="logistics-tab-actions">
                    <span className="logistics-meta-pill">Event {eventCount}</span>
                    <span className="logistics-meta-pill">Task {tasks.length}</span>
                </div>
            </div>

            <div className="logistics-grid-3">
                {axisCards.map(card => (
                    <article key={card.domain} className="logistics-overview-card logistics-axis-card">
                        <div className="logistics-overview-title">
                            <div>
                                <div className="logistics-overview-domain">{card.domain}</div>
                                <div className="logistics-axis-caption">{card.caption}</div>
                            </div>
                            <span className={`logistics-status-chip ${card.riskTone === 'danger' ? 'failed' : card.riskTone === 'warn' ? 'active' : 'completed'}`}>
                                {card.riskLabel}
                            </span>
                        </div>

                        <div className="logistics-axis-metrics">
                            <div className="logistics-axis-metric">
                                <span className="logistics-axis-label">적재량</span>
                                <strong>{card.load}</strong>
                            </div>
                            <div className="logistics-axis-metric">
                                <span className="logistics-axis-label">진행중</span>
                                <strong>{card.active}</strong>
                            </div>
                            <div className="logistics-axis-metric">
                                <span className="logistics-axis-label">멈춤/실패</span>
                                <strong>{card.paused + card.failed}</strong>
                            </div>
                        </div>

                        <div className="logistics-axis-summary">
                            <div className="logistics-axis-line">
                                <span className="logistics-axis-line-label">병목 단계</span>
                                <span className="logistics-axis-line-value">
                                    {STAGE_LABELS[card.hotspot.stage]} {card.hotspot.count}건
                                </span>
                            </div>
                            <div className="logistics-axis-line">
                                <span className="logistics-axis-line-label">리스크</span>
                                <span className="logistics-axis-line-value">{card.riskText}</span>
                            </div>
                        </div>
                    </article>
                ))}
            </div>

            {tasks.length === 0 && (
                <div className="logistics-empty-card" style={{ marginTop: '14px' }}>
                    아직 진행 중인 task가 없다. Auto 시작이나 등록 버튼으로 흐름을 넣으면 병목 단계가 이 탭에 먼저 뜬다.
                </div>
            )}
        </section>
    );
}
