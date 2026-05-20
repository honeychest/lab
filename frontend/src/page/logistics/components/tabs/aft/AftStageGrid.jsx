import { AFT_STAGE_WORK_NODES, AFT_STAGES } from '@/domain/logistics/common/stages';
import StageWorkGrid from '../shared/StageWorkGrid';

export default function AftStageGrid({ tasks, focusedTaskId, onPopover }) {
    return (
        <StageWorkGrid
            gridClassName="logistics-grid-2"
            stages={AFT_STAGES}
            workNodesByStage={AFT_STAGE_WORK_NODES}
            tasks={tasks}
            focusedTaskId={focusedTaskId}
            onPopover={onPopover}
            stacked
        />
    );
}
