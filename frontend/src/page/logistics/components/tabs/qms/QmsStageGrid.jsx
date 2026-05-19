import { QMS_STAGE_WORK_NODES, QMS_STAGES } from '@/domain/logistics/common/stages';
import StageWorkGrid from '../shared/StageWorkGrid';
import { progressPercent } from '../../../utils';

function stageWorkIndex(task) {
    const nodes = QMS_STAGE_WORK_NODES[task.currentStage] ?? [];
    if (nodes.length === 0) return 0;
    const receiveNodeIndex = nodes.findIndex(node => node.key === (task.failureReceiveNodeKey ?? task.receiveNodeKey));
    if (receiveNodeIndex >= 0) return receiveNodeIndex;
    const percent = progressPercent(task);
    const rawIndex = Math.floor((percent / 100) * nodes.length);
    return Math.min(nodes.length - 1, Math.max(0, rawIndex));
}

function getQmsNodeTasks(tasks, _stage, nodeIndex) {
    return tasks.filter(task => task.currentStage.startsWith('QMS_') && stageWorkIndex(task) === nodeIndex);
}

export default function QmsStageGrid({ tasks, focusedTaskId, onPopover }) {
    return (
        <StageWorkGrid
            gridClassName="logistics-grid-5 logistics-qms-stage-grid"
            stages={QMS_STAGES}
            workNodesByStage={QMS_STAGE_WORK_NODES}
            tasks={tasks}
            focusedTaskId={focusedTaskId}
            onPopover={onPopover}
            getNodeTasks={getQmsNodeTasks}
            stacked={false}
            cardClassName="logistics-work-node--qms-compact"
        />
    );
}
