import { useState } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { TMS_STAGE_WORK_NODES, TMS_STAGES, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import SupportFlowStrip from '../components/SupportFlowStrip';

function tasksForStage(tasks, stage) {
    return tasks.filter(task => task.type === 'ORDER' && task.currentStage === stage);
}

function progressPercent(task) {
    if (task?.status === 'completed') return 100;
    if (task?.status === 'failed') return 100;
    if (typeof task?.liveProgress === 'number') {
        return Math.max(6, Math.min(100, Math.round(task.liveProgress * 100)));
    }
    if (!task?.ticksTarget) return 10;
    return Math.max(10, Math.min(100, Math.round((task.ticksInCurrentStage / task.ticksTarget) * 100)));
}

function stageWorkIndex(task, stage) {
    const nodes = TMS_STAGE_WORK_NODES[stage] ?? [];
    if (nodes.length === 0) return 0;
    const nodeIndex = nodes.findIndex(node => node.key === task?.receiveNodeKey);
    if (nodeIndex >= 0) return nodeIndex;
    const percent = progressPercent(task);
    const rawIndex = Math.floor((percent / 100) * nodes.length);
    return Math.min(nodes.length - 1, Math.max(0, rawIndex));
}

function stageNodeTasks(tasks, stage, nodeIndex) {
    return tasks.filter(task => stageWorkIndex(task, stage) === nodeIndex);
}

function nodeStatusCounts(tasks) {
    return {
        active: tasks.filter(task => task.status === 'active').length,
        failed: tasks.filter(task => task.status === 'failed').length,
    };
}

function nodeStatusLabel(status) {
    if (status === 'all') return '전체';
    if (status === 'failed') return '실패';
    return '진행중';
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
    const [taskPopover, setTaskPopover] = useState(null);

    const openNodeTaskPopover = (event, stage, node, status, nodeTasks) => {
        event.stopPropagation();
        const filteredTasks = status === 'all'
            ? nodeTasks
            : nodeTasks.filter(task => task.status === status);
        if (filteredTasks.length === 0) return;
        if (filteredTasks.length === 1) {
            setFocus(filteredTasks[0].taskId);
            return;
        }
        setTaskPopover({
            stage,
            nodeKey: node.key,
            nodeLabel: node.label,
            status,
            tasks: filteredTasks,
        });
    };

    return (
        <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip title="TMS 흐름" flows={TMS_SUPPORT_FLOWS} onInfoOpen={onInfoOpen} />

            <div className="logistics-grid-5 logistics-stage-grid-shell logistics-stage-grid-scroll">
                {TMS_STAGES.map(stage => {
                    const stageTasks = tasksForStage(tasks, stage);
                    const stageNodes = TMS_STAGE_WORK_NODES[stage] ?? [];
                    return (
                        <article key={stage} className="logistics-lane logistics-work-lane">
                            <div className="logistics-lane-top">
                                <div className="logistics-lane-title">{STAGE_LABELS[stage]}</div>
                                <div className="logistics-lane-count">적재 {stageTasks.length}건</div>
                            </div>
                            <div className="logistics-receive-workflow">
                                {stageNodes.map((node, index) => {
                                    const nodeTasks = stageNodeTasks(stageTasks, stage, index);
                                    const counts = nodeStatusCounts(nodeTasks);
                                    return (
                                        <div
                                            key={node.key}
                                            className={`logistics-work-node logistics-work-node--stacked${nodeTasks.length > 0 ? ' active' : ''}${counts.active > 0 ? ' has-active' : ''}${counts.failed > 0 ? ' has-failure' : ''}`}
                                        >
                                            <div className="logistics-work-node-rail" aria-hidden="true">
                                                <span>{String(index + 1).padStart(2, '0')}</span>
                                            </div>
                                            <div className="logistics-work-node-body">
                                                <div className="logistics-work-node-top">
                                                    <div className="logistics-work-node-title">{node.label}</div>
                                                    <div className="logistics-work-node-top-meta">
                                                        <button
                                                            type="button"
                                                            className={`logistics-work-node-count ${nodeTasks.length === 0 ? 'is-empty' : ''}`}
                                                            disabled={nodeTasks.length === 0}
                                                            onClick={(event) => openNodeTaskPopover(event, stage, node, 'all', nodeTasks)}
                                                        >
                                                            {nodeTasks.length > 0 ? nodeTasks.length : ''}
                                                        </button>
                                                        <div className="logistics-work-node-status-row">
                                                            {[
                                                                ['active', '진행중', counts.active],
                                                                ['failed', '실패', counts.failed],
                                                            ].map(([status, label, count]) => (
                                                                <button
                                                                    key={status}
                                                                    type="button"
                                                                    className={`logistics-work-node-status ${status} ${count === 0 ? 'is-empty' : ''}`}
                                                                    disabled={count === 0}
                                                                    onClick={(event) => openNodeTaskPopover(event, stage, node, status, nodeTasks)}
                                                                >
                                                                    {status === 'active' ? (
                                                                        <span className={count > 0 ? 'sample_live_spinner' : 'logistics-status-idle-ring'} aria-hidden="true" />
                                                                    ) : (
                                                                        <span className="logistics-health-dot" aria-hidden="true">❌</span>
                                                                    )}
                                                                    <span>{label}</span>
                                                                    <strong>{count}</strong>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </article>
                    );
                })}
            </div>

            {taskPopover && (
                <div className="logistics-node-popover-backdrop" onClick={() => setTaskPopover(null)}>
                    <div className="logistics-node-popover" onClick={(event) => event.stopPropagation()}>
                        <div className="logistics-node-popover-top">
                            <div>
                                <div className="logistics-side-title">{STAGE_LABELS[taskPopover.stage]} · {taskPopover.nodeLabel}</div>
                                <div className="logistics-node-popover-title">{nodeStatusLabel(taskPopover.status)} {taskPopover.tasks.length}건</div>
                            </div>
                            <button type="button" className="logistics-outline-btn" onClick={() => setTaskPopover(null)}>닫기</button>
                        </div>
                        <div className="logistics-node-popover-list">
                            {taskPopover.tasks.map(task => (
                                <button
                                    key={task.taskId}
                                    type="button"
                                    className={`logistics-node-popover-row${focusedTaskId === task.taskId ? ' focused' : ''}`}
                                    onClick={() => {
                                        setFocus(task.taskId);
                                        setTaskPopover(null);
                                    }}
                                >
                                    <span>{task.taskId}</span>
                                    <strong>{task.vehicleId ?? 'VEH 대기'}</strong>
                                    <em>{task.destination}</em>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
