import { INBOUND_STAGES, INBOUND_STAGE_WORK_NODES } from '@/domain/logistics/common/stages';
import StageWorkGrid from '../shared/StageWorkGrid';

export default function InboundStageGrid({ tasks, focusedTaskId, onPopover }) {
    return (
        <StageWorkGrid
            gridClassName="logistics-grid-6"
            stages={INBOUND_STAGES}
            workNodesByStage={INBOUND_STAGE_WORK_NODES}
            tasks={tasks}
            focusedTaskId={focusedTaskId}
            onPopover={onPopover}
            taskTypes={['INBOUND', 'EOS']}
            stacked
        />
    );
}
