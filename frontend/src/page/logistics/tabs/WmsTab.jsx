import { useEffect } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { WMS_OUT_STAGES, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import { dlog } from '@/global/chs';
import SupportFlowStrip from '../components/SupportFlowStrip';

function tasksForStage(tasks, stage, type) {
    return tasks.filter(task => task.type === type && task.currentStage === stage);
}

function progressPercent(task) {
    if (task?.status === 'completed') return 100;
    if (task?.status === 'failed') return 100;
    if (typeof task?.liveProgress === 'number') {
        return Math.max(6, Math.min(100, Math.round(task.liveProgress * 100)));
    }
    return 10;
}

function statusText(task) {
    if (task.status === 'completed' && task.currentStage === 'TMS_DELIVERED') return '인도 완료';
    if (task.status === 'completed') return '완료';
    if (task.status === 'failed') return '실패';
    if (task.status === 'paused') return '일시정지';
    return '진행 중';
}

const WMS_SUPPORT_FLOWS = [
    {
        key: 'wms-inbound',
        label: 'Inbound 입고',
        meta: '입고 5단',
        stageLabel: 'WMS 보조 흐름',
        summary: '창고로 상품이 들어와 재고에 반영되는 흐름입니다. 출고 7단의 메인 레인은 아니지만 재고 할당의 upstream 근거입니다.',
        bullets: [
            '흐름: 입고 등록 → 유효성 → Zone 배정 → 재고 반영 → 완료',
            '이번 L1 화면에서는 카드레인을 제거하고 보조 흐름 설명으로 축소',
            '기존 dlog/dtag와 tickLoop 입고 단계는 유지해 후속 구현에서 회수 가능',
        ],
        handoffLog: 'WmsTab.supportFlow — Inbound 5단 상세 화면/재고 반영/Zone 배정 구현 회수 지점',
        stage: 2,
    },
    {
        key: 'wms-inventory',
        label: 'Inventory 재고',
        meta: '할당/Zone/Lot',
        stageLabel: 'WMS 보조 흐름',
        summary: '출고 할당이 가능한 재고를 계산하고 Zone, Lot, FEFO 같은 운영 규칙을 적용하는 흐름입니다.',
        bullets: [
            '현재 L1은 랜덤 Zone/박스와 dlog 승계 자리만 제공',
            '재고 차감, 경합 제어, Lot/FEFO는 co/L4 구현 대상',
            '할당 실패와 입고 반영 흐름을 연결하는 핵심 보조 작업',
        ],
        handoffLog: 'WmsTab.supportFlow — 재고 할당/차감/경합/Zone/Lot 정책 구현 회수 지점',
        stage: 2,
    },
    {
        key: 'wms-exception',
        label: 'Exception 예외/복구',
        meta: '실패 조치',
        stageLabel: 'WMS 보조 흐름',
        summary: '할당 실패, 피킹 실패, 문서 누락 같은 창고 운영 예외를 운영자가 조치하는 흐름입니다.',
        bullets: [
            '현재 L1은 우측 상세 패널의 분기 주입과 조치 버튼으로 표현',
            '조치 결과는 이벤트 체인과 감사 로그에 남는 구조',
            '실패 유형별 매트릭스와 복구 정책은 co 단계 회수 대상',
        ],
        handoffLog: 'WmsTab.supportFlow — WMS 예외 매트릭스/복구 정책/감사 로그 구현 회수 지점',
        stage: 2,
    },
];

export default function WmsTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();

    useEffect(() => {
        dlog(1, 'WmsTab — OMS/TMS와 맞춰 출고 7단 레인만 메인 표시');
        dlog(2, 'WmsTab — Inbound 5단은 보조 흐름 팝업으로 축소, 상세 구현은 dlog/dtag로 후속 회수');
    }, []);

    return (
        <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip flows={WMS_SUPPORT_FLOWS} onInfoOpen={onInfoOpen} />

            <div className="logistics-grid-7 logistics-stage-grid-shell" style={{ overflowX: 'auto' }}>
                {WMS_OUT_STAGES.map(stage => {
                    const stageTasks = tasksForStage(tasks, stage, 'ORDER');
                    return (
                        <article key={stage} className="logistics-lane">
                            <div className="logistics-lane-top">
                                <div className="logistics-lane-title">{STAGE_LABELS[stage]}</div>
                                <div className="logistics-lane-count">적재 {stageTasks.length}건</div>
                            </div>
                            <div className="logistics-card-stack">
                                {stageTasks.length > 0 ? stageTasks.map(task => (
                                    <button
                                        key={task.taskId}
                                        type="button"
                                        className={`logistics-preview-card${focusedTaskId === task.taskId ? ' focused' : ''}`}
                                        style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}
                                        onClick={() => setFocus(task.taskId)}
                                    >
                                        <div className="logistics-preview-top">
                                            <div className="logistics-preview-id">{task.taskId}</div>
                                            <span className={`logistics-status-chip ${task.status}`}>{statusText(task)}</span>
                                        </div>
                                        <div className="logistics-preview-meta">
                                            {task.owner} · {task.itemCode}
                                            {task.boxId ? ` · ${task.boxId}` : ''}
                                        </div>
                                        <div className={`logistics-progress ${task.status}`}><span style={{ width: `${progressPercent(task)}%` }} /></div>
                                    </button>
                                )) : (
                                    <div className="logistics-empty-card">
                                        {stage === 'WMS_ALLOCATED' ? '할당 실패는 우측 상세 패널 조치로 전환된다.' : '카드 유입 대기'}
                                    </div>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}
