import { OMS_STAGE_WORK_NODES, OMS_STAGES } from '@/domain/logistics/common/stages';
import StageWorkGrid from '../shared/StageWorkGrid';

export default function OmsStageGrid({ tasks, focusedTaskId, onPopover }) {
    return (
        <StageWorkGrid
            gridClassName="logistics-grid-3"
            stages={OMS_STAGES}
            workNodesByStage={OMS_STAGE_WORK_NODES}
            tasks={tasks}
            focusedTaskId={focusedTaskId}
            onPopover={onPopover}
            stacked={false}
        />
    );
}
