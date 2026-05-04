import { useEffect, useState } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { OMS_STAGE_WORK_NODES, OMS_STAGES, STAGE_LABELS } from '@/domain/logistics/common/stages';
import {
    createBulkOmsOrders,
    createOmsTask,
    OWNER_OPTIONS,
    ITEM_OPTIONS,
    DESTINATION_OPTIONS,
} from '../services/omsSimulation';
import { dlog } from '@/global/chs';
import { setFocus } from '@/store/focusStore';
import SupportFlowStrip from '../components/SupportFlowStrip';

const OWNER_KEY = 'logistics.ownerSelection';

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
    const nodes = OMS_STAGE_WORK_NODES[stage] ?? [];
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

function defaultForm(owner) {
    return {
        owner,
        itemCode: ITEM_OPTIONS[0],
        quantity: 3,
        destination: DESTINATION_OPTIONS[0],
    };
}

const OMS_SUPPORT_FLOWS = [
    {
        key: 'oms-owner-portal',
        label: 'Owner Portal',
        meta: '화주 시점',
        stageLabel: 'OMS 보조 흐름',
        summary: '화주가 자기 주문과 입고 요청을 등록하거나 상태를 확인하는 별도 시점입니다.',
        bullets: [
            '현재 L1에서는 화면 노출 없이 설명 팝업만 제공',
            '권한, 화주별 필터, 외부 입력 검증은 후속 구현 대상',
            'OMS 접수 관문과 같은 이벤트 흐름으로 합류',
        ],
        handoffLog: 'OmsTab.supportFlow — Owner Portal 권한/화주별 필터/입력 검증 구현 회수 지점',
        stage: 2,
    },
    {
        key: 'oms-validation',
        label: 'Validation 검증예외',
        meta: '주문 반려/보류',
        stageLabel: 'OMS 보조 흐름',
        summary: '주문을 WMS로 넘기기 전에 화주, 품목, 수량, 도착지 오류를 걸러내는 흐름입니다.',
        bullets: [
            '현재 L1은 단계 설명과 실패 주입 후보로만 표현',
            '실제 검증 규칙 4종은 co 단계에서 교체',
            '실패 시 감사 로그와 운영자 조치 흐름으로 연결',
        ],
        handoffLog: 'OmsTab.supportFlow — OMS 검증 규칙/반려/보류/감사 로그 구현 회수 지점',
        stage: 2,
    },
];

export default function OmsTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();
    const [bulkProgress, setBulkProgress] = useState({ active: false, current: 0, total: 20 });
    const [selectedOwner, setSelectedOwner] = useState(() => window.localStorage.getItem(OWNER_KEY) ?? OWNER_OPTIONS[0]);
    const [form, setForm] = useState(() => defaultForm(window.localStorage.getItem(OWNER_KEY) ?? OWNER_OPTIONS[0]));
    const [modalMode, setModalMode] = useState(null);
    const [taskPopover, setTaskPopover] = useState(null);

    useEffect(() => {
        window.localStorage.setItem(OWNER_KEY, selectedOwner);
    }, [selectedOwner]);

    useEffect(() => {
        setForm(current => ({ ...current, owner: selectedOwner }));
    }, [selectedOwner]);

    useEffect(() => {
        dlog(2, 'OmsTab — 화주 Portal 시점 토글 UI는 현재 숨김. co/후속 단계에서 범위 재승인 시 노출 검토 (REQ-T2-004 [pu])');
    }, []);

    const handleSubmit = async () => {
        if (!modalMode) return;
        const inbound = modalMode === 'inbound';
        await createOmsTask({
            ...form,
            inbound,
            sourceChannel: 'operator',
            ownerView: false,
        });
        if (inbound) {
            dlog(1, 'OmsTab.handleInboundCreate — 입고 예약/등록 실행');
            dlog(2, 'OmsTab.handleInboundCreate — co에서 OMS 단일 진입 관문 검증/입고 이벤트 브로커 교체 지점 (REQ-T2-013 [pu])', form.owner);
        } else {
            dlog(1, 'OmsTab.handleSingleCreate — 단건 등록 실행');
        }
        setModalMode(null);
    };

    const handleBulkCreate = async () => {
        if (bulkProgress.active) return;
        setBulkProgress({ active: true, current: 0, total: 20 });

        try {
            await createBulkOmsOrders((current, total) => {
                setBulkProgress({ active: true, current, total });
            });
        } finally {
            setBulkProgress(progress => ({ ...progress, active: false }));
        }
    };

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

    const omsFlows = [
        {
            key: 'oms-create-order',
            label: '오더 등록',
            meta: '단건 주문 생성',
            variant: 'action',
            onClick: () => setModalMode('order'),
        },
        {
            key: 'oms-create-inbound',
            label: '입고 계약',
            meta: '입고 요청 생성',
            variant: 'action',
            onClick: () => setModalMode('inbound'),
        },
        {
            key: 'oms-create-bulk',
            label: bulkProgress.active ? `투입 중 ${bulkProgress.current}/${bulkProgress.total}` : '일괄 등록 20건',
            meta: '대량 주문 투입',
            variant: 'action',
            disabled: bulkProgress.active,
            onClick: handleBulkCreate,
        },
        ...OMS_SUPPORT_FLOWS,
    ];

    return (
        <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip title="OMS 흐름" flows={omsFlows} onInfoOpen={onInfoOpen} />

            {bulkProgress.active && (
                <div className="logistics-preview-ribbon" style={{ padding: '14px', borderRadius: '16px', marginBottom: '12px' }}>
                    <div className="logistics-side-title">일괄 등록 진행</div>
                    <div className="logistics-preview-note">순차 투입 중 {bulkProgress.current}/{bulkProgress.total}</div>
                    <div className="logistics-progress" style={{ marginTop: '10px' }}>
                        <span style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }} />
                    </div>
                </div>
            )}

            <div className="logistics-grid-3 logistics-stage-grid-shell logistics-stage-grid-scroll">
                {OMS_STAGES.map(stage => {
                    const stageTasks = tasksForStage(tasks, stage);
                    const stageNodes = OMS_STAGE_WORK_NODES[stage] ?? [];
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
                                        <div key={node.key} className={`logistics-work-node${nodeTasks.length > 0 ? ' active' : ''}${counts.active > 0 ? ' has-active' : ''}${counts.failed > 0 ? ' has-failure' : ''}`}>
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
                                    <strong>{task.owner}</strong>
                                    <em>{task.itemCode} · {task.quantity}ea</em>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {modalMode && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'var(--dark-overlay-bg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 110,
                    }}
                    onClick={() => setModalMode(null)}
                >
                    <div
                        className="logistics-side-section"
                        style={{ background: 'var(--dark-modal-bg)', minWidth: '340px', maxWidth: '420px' }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="logistics-side-title">{modalMode === 'inbound' ? '입고 예약' : '오더 등록'}</div>
                        <div className="logistics-settings-advanced" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                            <label className="logistics-slider-wrap compact">
                                <span className="logistics-settings-stage"><span>화주</span></span>
                                <select
                                    value={selectedOwner}
                                    onChange={(event) => setSelectedOwner(event.target.value)}
                                    className="logistics-outline-btn"
                                >
                                    {OWNER_OPTIONS.map(owner => <option key={owner} value={owner}>{owner}</option>)}
                                </select>
                            </label>
                            <label className="logistics-slider-wrap compact">
                                <span className="logistics-settings-stage"><span>품목</span></span>
                                <select
                                    value={form.itemCode}
                                    onChange={(event) => setForm(current => ({ ...current, itemCode: event.target.value }))}
                                    className="logistics-outline-btn"
                                >
                                    {ITEM_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </label>
                            <label className="logistics-slider-wrap compact">
                                <span className="logistics-settings-stage"><span>도착지</span></span>
                                <select
                                    value={form.destination}
                                    onChange={(event) => setForm(current => ({ ...current, destination: event.target.value }))}
                                    className="logistics-outline-btn"
                                >
                                    {DESTINATION_OPTIONS.map(destination => <option key={destination} value={destination}>{destination}</option>)}
                                </select>
                            </label>
                            <label className="logistics-slider-wrap compact">
                                <span className="logistics-settings-stage">
                                    <span>수량</span>
                                    <span className="logistics-meta-pill">{form.quantity} ea</span>
                                </span>
                                <input
                                    type="range"
                                    min="1"
                                    max="30"
                                    step="1"
                                    value={form.quantity}
                                    onChange={(event) => setForm(current => ({ ...current, quantity: Number(event.target.value) }))}
                                />
                            </label>
                        </div>
                        <div className="logistics-button-row">
                            <button className="logistics-primary-btn" onClick={handleSubmit}>
                                {modalMode === 'inbound' ? '입고 요청 생성' : '오더 생성'}
                            </button>
                            <button className="logistics-outline-btn" onClick={() => setModalMode(null)}>닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
