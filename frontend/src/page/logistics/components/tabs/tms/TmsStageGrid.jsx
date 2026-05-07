import { TMS_STAGE_WORK_NODES, TMS_STAGES } from '@/domain/logistics/common/stages';
import StageWorkGrid from '../shared/StageWorkGrid';

export default function TmsStageGrid({ tasks, focusedTaskId, onPopover }) {
    return (
        <StageWorkGrid
            gridClassName="logistics-grid-5"
            stages={TMS_STAGES}
            workNodesByStage={TMS_STAGE_WORK_NODES}
            tasks={tasks}
            focusedTaskId={focusedTaskId}
            onPopover={onPopover}
            stacked
        />
    );
}
