import { useState } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { TMS_STAGE_WORK_NODES, TMS_STAGES, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import SupportFlowStrip from '../components/SupportFlowStrip';
import WorkNodeCard from '../components/WorkNodeCard';
import { TMS_SUPPORT_FLOWS } from '../constants';
import { tasksForStage, stageNodeTasks, nodeStatusLabel } from '../utils';

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
                                    const nodeTasks = stageNodeTasks(stageTasks, stage, index, stageNodes);
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
