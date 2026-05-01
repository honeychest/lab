import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { TMS_STAGES, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import SupportFlowStrip from '../components/SupportFlowStrip';

function tasksForStage(tasks, stage) {
    return tasks.filter(task => task.currentStage === stage);
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

const TMS_SUPPORT_FLOWS = [
    {
        key: 'tms-dispatch',
        label: 'Dispatch 배차예외',
        meta: '차량 부족/재배차',
        stageLabel: 'TMS 보조 흐름',
        summary: '배차 요청 이후 차량 부족, 비용 조건, 재배차가 필요한 상황을 처리하는 흐름입니다.',
        bullets: [
            '현재 L1은 실패 후보와 조치 버튼으로만 표현',
            '차량 가용성, 경로 비용, 배차 정책은 co 단계 구현 대상',
            'WMS 출하 완료 이후 TMS 책임 구간에서 발생',
        ],
        handoffLog: 'TmsTab.supportFlow — 차량 가용성/경로 비용/재배차 정책 구현 회수 지점',
        stage: 2,
    },
    {
        key: 'tms-tracking',
        label: 'Tracking 운송추적',
        meta: 'Track & Trace',
        stageLabel: 'TMS 보조 흐름',
        summary: '상차 이후 운송 진행 상태와 외부 위치 이벤트를 따라가는 흐름입니다.',
        bullets: [
            '현재 L1은 운송 단계와 이벤트 로그 요약만 제공',
            '실시간 위치, 외부 운송사 연동, 지연 판단은 L4 대상',
            '인도 완료 이벤트가 WMS 완료와 전체 주문 종료로 이어짐',
        ],
        handoffLog: 'TmsTab.supportFlow — 운송 추적/외부 운송사 연동/지연 판단 구현 회수 지점',
        stage: 4,
    },
    {
        key: 'tms-reverse',
        label: 'Reverse 반품',
        meta: '인도 실패 후 회수',
        stageLabel: 'TMS 보조 흐름',
        summary: '인도 실패, 수취 거부, 반품 요청이 발생했을 때 회수와 재입고로 이어지는 흐름입니다.',
        bullets: [
            '현재 L1은 설명 팝업과 dlog 승계만 남김',
            '반품 상세 화면과 재입고 연결은 후속 고도화 대상',
            'TMS 실패에서 WMS/Inventory로 되돌아가는 횡단 흐름',
        ],
        handoffLog: 'TmsTab.supportFlow — Reverse Logistics 반품/회수/재입고 연결 구현 회수 지점',
        stage: 4,
    },
];

export default function TmsTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();

    return (
        <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip flows={TMS_SUPPORT_FLOWS} onInfoOpen={onInfoOpen} />

            <div className="logistics-grid-5 logistics-stage-grid-shell">
                {TMS_STAGES.map(stage => {
                    const stageTasks = tasksForStage(tasks, stage);
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
                                        <div className="logistics-preview-meta">{task.vehicleId ?? 'VEH 대기'} · {task.destination}</div>
                                        <div className={`logistics-progress ${task.status}`}><span style={{ width: `${progressPercent(task)}%` }} /></div>
                                    </button>
                                )) : (
                                    <div className="logistics-empty-card">
                                        {stage === 'TMS_DELIVERING' ? '현재 운송 중 카드 없음' : '운송 카드 대기'}
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
