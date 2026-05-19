import { WMS_STAGE_WORK_NODES } from '@/domain/logistics/common/stages';
import { WMS_STAGES } from '../../../constants';
import { progressPercent } from '../../../utils';
import StageWorkGrid from '../shared/StageWorkGrid';

function stageWorkIndex(task) {
    const nodes = WMS_STAGE_WORK_NODES[task.currentStage] ?? [];
    if (nodes.length === 0) return 0;
    const receiveNodeIndex = nodes.findIndex(node => node.key === (task.failureReceiveNodeKey ?? task.receiveNodeKey));
    if (receiveNodeIndex >= 0) return receiveNodeIndex;
    const percent = progressPercent(task);
    const rawIndex = Math.floor((percent / 100) * nodes.length);
    return Math.min(nodes.length - 1, Math.max(0, rawIndex));
}

function getWmsNodeTasks(tasks, stage, nodeIndex) {
    return tasks.filter(task => task.currentStage === stage && stageWorkIndex(task) === nodeIndex);
}

export default function WmsStageGrid({ tasks, focusedTaskId, onPopover }) {
    return (
        <StageWorkGrid
            gridClassName="logistics-grid-7"
            stages={WMS_STAGES}
            workNodesByStage={WMS_STAGE_WORK_NODES}
            tasks={tasks}
            focusedTaskId={focusedTaskId}
            onPopover={onPopover}
            getNodeTasks={getWmsNodeTasks}
            stacked
        />
    );
}
