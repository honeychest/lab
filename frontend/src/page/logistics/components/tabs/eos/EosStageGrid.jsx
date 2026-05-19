import { EOS_STAGE_WORK_NODES, EOS_STAGES } from '@/domain/logistics/common/stages';
import StageWorkGrid from '../shared/StageWorkGrid';

export default function EosStageGrid({ tasks, focusedTaskId, onPopover }) {
    return (
        <StageWorkGrid
            gridClassName="logistics-grid-6"
            stages={EOS_STAGES}
            workNodesByStage={EOS_STAGE_WORK_NODES}
            tasks={tasks}
            focusedTaskId={focusedTaskId}
            onPopover={onPopover}
            taskTypes={['EOS']}
            stacked
        />
    );
}
