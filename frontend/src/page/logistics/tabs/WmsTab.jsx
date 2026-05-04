import { useState, useEffect } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { STAGE_LABELS, WMS_STAGE_WORK_NODES } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import { dlog } from '@/global/chs';
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

function nodeStatusCounts(tasks) {
    return {
        active: tasks.filter(t => t.status === 'active').length,
        failed: tasks.filter(t => t.status === 'failed').length,
    };
}

function nodeStatusLabel(status) {
    if (status === 'all') return '전체';
    if (status === 'failed') return '실패';
    return '진행중';
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

const WMS_STAGES = [
    'WMS_RECEIVED',
    'WMS_ALLOCATED',
    'WMS_PICKING',
    'WMS_PACKED',
    'WMS_DISPATCHED',
    'WMS_DELIVERING',
    'WMS_COMPLETED',
];

function stageWorkIndex(task, stage) {
    const nodes = WMS_STAGE_WORK_NODES[stage] ?? [];
    if (nodes.length === 0) return 0;
    const receiveNodeIndex = nodes.findIndex(node => node.key === (task.failureReceiveNodeKey ?? task.receiveNodeKey));
    if (receiveNodeIndex >= 0) return receiveNodeIndex;
    const percent = progressPercent(task);
    const rawIndex = Math.floor((percent / 100) * nodes.length);
    return Math.min(nodes.length - 1, Math.max(0, rawIndex));
}

function stageNodeTasks(tasks, stage, nodeIndex) {
    return tasks.filter(task => stageWorkIndex(task, stage) === nodeIndex);
}

export default function WmsTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();
    const [taskPopover, setTaskPopover] = useState(null);

    useEffect(() => {
        dlog(1, 'WmsTab — OMS 참조 단일 레인 work-node 방식 (7단 세로 배치)');
        dlog(2, 'WmsTab — Inbound 5단은 보조 흐름 팝업으로 축소, 상세 구현은 dlog/dtag로 후속 회수');
    }, []);

    const openNodeTaskPopover = (event, stage, node, status, nodeTasks) => {
        event.stopPropagation();
        const filtered = status === 'all' ? nodeTasks : nodeTasks.filter(t => t.status === status);
        if (filtered.length === 0) return;
        if (filtered.length === 1) {
            setFocus(filtered[0].taskId);
            return;
        }
        setTaskPopover({
            stage,
            nodeKey: node.key,
            nodeLabel: node.label,
            status,
            tasks: filtered,
        });
    };

    const renderNode = (stage, node, index, nodeTasks) => {
        const counts = nodeStatusCounts(nodeTasks);
        const nodeClass = [
            'logistics-work-node logistics-work-node--stacked',
            nodeTasks.length > 0 ? 'active' : '',
            counts.active > 0 ? 'has-active' : '',
            counts.failed > 0 ? 'has-failure' : '',
        ].filter(Boolean).join(' ');

        return (
            <div key={node.key} className={nodeClass}>
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
    };

    return (
        <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip title="WMS 흐름" flows={WMS_SUPPORT_FLOWS} onInfoOpen={onInfoOpen} />

            <div className="logistics-grid-7 logistics-stage-grid-shell logistics-stage-grid-scroll">
                {WMS_STAGES.map(stage => {
                    const stageTasks = tasksForStage(tasks, stage);
                    const stageNodes = WMS_STAGE_WORK_NODES[stage] ?? [];
                    return (
                        <article key={stage} className="logistics-lane logistics-work-lane">
                            <div className="logistics-lane-top">
                                <div className="logistics-lane-title">{STAGE_LABELS[stage]}</div>
                                <div className="logistics-lane-count">적재 {stageTasks.length}건</div>
                            </div>
                            <div className="logistics-receive-workflow">
                                {stageNodes.map((node, index) => {
                                    const nodeTasks = stageNodeTasks(stageTasks, stage, index);
                                    return renderNode(stage, node, index, nodeTasks);
                                })}
                            </div>
                        </article>
                    );
                })}
            </div>

            {taskPopover && (
                <div className="logistics-node-popover-backdrop" onClick={() => setTaskPopover(null)}>
                    <div className="logistics-node-popover" onClick={e => e.stopPropagation()}>
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
                                    <strong>{task.owner} · {task.itemCode}</strong>
                                    <em>{task.boxId ?? task.zoneId ?? '-'}</em>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
