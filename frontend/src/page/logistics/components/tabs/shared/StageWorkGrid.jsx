import { STAGE_LABELS } from '@/domain/logistics/common/stages';
import WorkNodeCard from '../../WorkNodeCard';
import { tasksForStage, stageNodeTasks as defaultStageNodeTasks } from '../../../utils';

function StageWorkLane({
    stage,
    tasks,
    stageNodes,
    focusedTaskId,
    onPopover,
    getNodeTasks,
    stacked,
    cardClassName,
}) {
    const stageTasks = tasksForStage(tasks, stage);

    return (
        <article className="logistics-lane logistics-work-lane">
            <div className="logistics-lane-top">
                <div className="logistics-lane-title">{STAGE_LABELS[stage]}</div>
                <div className="logistics-lane-count">적재 {stageTasks.length}건</div>
            </div>
            <div className="logistics-receive-workflow">
                {stageNodes.map((node, index) => {
                    const nodeTasks = getNodeTasks(stageTasks, stage, index, stageNodes);
                    const focused = nodeTasks.some(t => t.taskId === focusedTaskId);
                    const focusedFailed = nodeTasks.some(t => t.taskId === focusedTaskId && t.status === 'failed');
                    return (
                        <WorkNodeCard
                            key={node.key}
                            node={node}
                            index={index}
                            nodeTasks={nodeTasks}
                            stage={stage}
                            onPopover={onPopover}
                            stacked={stacked}
                            className={cardClassName}
                            focused={focused}
                            focusedFailed={focusedFailed}
                        />
                    );
                })}
            </div>
        </article>
    );
}

export default function StageWorkGrid({
    gridClassName,
    stages,
    workNodesByStage,
    tasks,
    focusedTaskId,
    onPopover,
    getNodeTasks = defaultStageNodeTasks,
    stacked = false,
    cardClassName = '',
}) {
    return (
        <div className={`${gridClassName} logistics-stage-grid-shell logistics-stage-grid-scroll`}>
            {stages.map(stage => (
                <StageWorkLane
                    key={stage}
                    stage={stage}
                    tasks={tasks}
                    stageNodes={workNodesByStage[stage] ?? []}
                    focusedTaskId={focusedTaskId}
                    onPopover={onPopover}
                    getNodeTasks={getNodeTasks}
                    stacked={stacked}
                    cardClassName={cardClassName}
                />
            ))}
        </div>
    );
}
