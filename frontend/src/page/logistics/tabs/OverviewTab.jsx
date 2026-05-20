import { useState } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import TaskListPopover from '../components/TaskListPopover';
import { STAGE_DOMAIN } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import {
    EOS_STAGES,
    OMS_STAGES,
    INBOUND_STAGES,
    QMS_STAGES,
    TMS_STAGES,
    AFT_STAGES,
    STAGE_LABELS,
} from '@/domain/logistics/common/stages';

const WMS_OUT_PHASE_1 = ['WMS_RECEIVED', 'WMS_ALLOCATED', 'WMS_PICKING', 'WMS_PACKED'];
const WMS_OUT_PHASE_2 = ['WMS_DISPATCHED', 'WMS_COMPLETED'];

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
    const activeTasks = scopedTasks.filter(task => task.status === 'active');
    const pausedFailedTasks = scopedTasks.filter(task => task.status === 'paused' || task.status === 'failed');
    const failed = failedCount(scopedTasks);
    const paused = stalledCount(scopedTasks);

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
        activeTasks,
        pausedFailedTasks,
        active: activeTasks.length,
        hotspot,
        failed,
        paused,
        riskTone,
        riskLabel,
        riskText,
    };
}

function stageToTab(task) {
    const stage = task.currentStage;
    const domain = STAGE_DOMAIN[stage];
    if (domain === 'WMS') {
        if (INBOUND_STAGES.includes(stage)) return 'inbound';
        if (WMS_OUT_PHASE_2.includes(stage)) return 'wms-2';
        return 'wms-1';
    }
    if (domain === 'OMS') return 'oms';
    if (domain === 'QMS') return 'qms';
    if (domain === 'TMS') return 'tms';
    if (domain === 'EOS') return 'eos';
    if (domain === 'AFT') return 'aft';
    return 'list';
}

export default function OverviewTab({ onTabChange }) {
    const { tasks } = useLogisticsSnapshot();
    const [popover, setPopover] = useState(null);

    const axisCards = [
        buildAxisCard(tasks, 'EOS', EOS_STAGES, '수요예측·발주·송신'),
        buildAxisCard(tasks, 'INBOUND', INBOUND_STAGES, '입고 접수·검수·적치'),
        buildAxisCard(tasks, 'OMS', OMS_STAGES, '주문 접수·검증·WMS 이관'),
        buildAxisCard(tasks, 'WMS-1', WMS_OUT_PHASE_1, '할당·피킹·패킹'),
        buildAxisCard(tasks, 'QMS', QMS_STAGES, '검사·샘플·판정·출고승인'),
        buildAxisCard(tasks, 'WMS-2', WMS_OUT_PHASE_2, '도크 인계·출고 종료'),
        buildAxisCard(tasks, 'TMS', TMS_STAGES, '배차·상차·배송·인도'),
        buildAxisCard(tasks, 'AFT', AFT_STAGES, '정산·CS·종결'),
    ];

    return (
        <section className="logistics-tab-shell">
            <div className="logistics-tab-header">
                <div>
                    <h2 className="logistics-tab-title">작업 진행 개요</h2>
                    <p className="logistics-tab-copy" style={{ display: 'block' }}>
                        전체 흐름 요약보다 어디가 막히는지 먼저 읽는 탭. 진입축(EOS·OMS)·처리축(WMS·QMS·TMS)별 적체, 실패, 집중 단계를 바로 본다.
                    </p>
                </div>
                <div className="logistics-tab-actions">
                    <span className="logistics-meta-pill">Task {tasks.length}</span>
                </div>
            </div>

            <div className="logistics-grid-8">
                {axisCards.map(card => (
                    <article key={card.domain} className="logistics-overview-card logistics-axis-card logistics-axis-card--compact">
                        <div className="logistics-overview-title">
                            <div className="logistics-overview-domain">{card.domain}</div>
                            <span
                                className={`logistics-status-chip ${card.riskTone === 'danger' ? 'failed' : card.riskTone === 'warn' ? 'active' : 'completed'}`}
                                title={card.riskText}
                            >
                                {card.riskLabel}
                            </span>
                        </div>
                        <div className="logistics-axis-caption" title={card.caption}>{card.caption}</div>

                        <div className="logistics-axis-metrics">
                            <button
                                type="button"
                                className="logistics-axis-metric logistics-axis-metric-btn"
                                onClick={() => card.active > 0 && setPopover({ title: `${card.domain} 진행중`, tasks: card.activeTasks, variant: 'processing' })}
                            >
                                <span className="logistics-axis-label">진행중</span>
                                <strong>{card.active}</strong>
                            </button>
                            <button
                                type="button"
                                className="logistics-axis-metric logistics-axis-metric-btn"
                                onClick={() => (card.paused + card.failed) > 0 && setPopover({ title: `${card.domain} 멈춤/실패`, tasks: card.pausedFailedTasks, variant: 'failed' })}
                            >
                                <span className="logistics-axis-label">멈춤/실패</span>
                                <strong>{card.paused + card.failed}</strong>
                            </button>
                        </div>

                        <div className="logistics-axis-hotspot" title={`${STAGE_LABELS[card.hotspot.stage]} ${card.hotspot.count}건`}>
                            병목 <strong>{STAGE_LABELS[card.hotspot.stage]}</strong> {card.hotspot.count}건
                        </div>
                    </article>
                ))}
            </div>

            {popover && (
                <TaskListPopover
                    title={popover.title}
                    tasks={popover.tasks}
                    emptyMessage="해당 작업 없음"
                    variant={popover.variant}
                    onClose={() => setPopover(null)}
                    onTaskSelect={task => {
                        setFocus(task.taskId);
                        onTabChange?.(stageToTab(task));
                        setPopover(null);
                    }}
                />
            )}

            {tasks.length === 0 && (
                <div className="logistics-empty-card" style={{ marginTop: '14px' }}>
                    아직 진행 중인 task가 없다. Auto 시작이나 등록 버튼으로 흐름을 넣으면 병목 단계가 이 탭에 먼저 뜬다.
                </div>
            )}
        </section>
    );
}
