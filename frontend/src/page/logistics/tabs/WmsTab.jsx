import { useState, useEffect } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { STAGE_LABELS, WMS_STAGE_WORK_NODES } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import { dlog } from '@/global/chs';
import SupportFlowStrip from '../components/SupportFlowStrip';
import WorkNodeCard from '../components/WorkNodeCard';
import { WMS_SUPPORT_FLOWS, WMS_STAGES } from '../constants';
import { tasksForStage, progressPercent, nodeStatusLabel } from '../utils';

function stageWorkIndex(task) {
    const nodes = WMS_STAGE_WORK_NODES[task.currentStage] ?? [];
    if (nodes.length === 0) return 0;
    const receiveNodeIndex = nodes.findIndex(node => node.key === (task.failureReceiveNodeKey ?? task.receiveNodeKey));
    if (receiveNodeIndex >= 0) return receiveNodeIndex;
    const percent = progressPercent(task);
    const rawIndex = Math.floor((percent / 100) * nodes.length);
    return Math.min(nodes.length - 1, Math.max(0, rawIndex));
}

function stageNodeTasks(tasks, stage, nodeIndex) {
    return tasks.filter(task => stageWorkIndex(task) === nodeIndex);
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
                                    const focused = nodeTasks.some(t => t.taskId === focusedTaskId);
                                    const focusedFailed = nodeTasks.some(t => t.taskId === focusedTaskId && t.status === 'failed');
                                    return <WorkNodeCard key={node.key} node={node} index={index} nodeTasks={nodeTasks} stage={stage} onPopover={openNodeTaskPopover} focused={focused} focusedFailed={focusedFailed} />;
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
