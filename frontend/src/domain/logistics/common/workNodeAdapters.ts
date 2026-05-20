import { patchTask } from '@/store/taskStore';
import { appendEvent } from '@/store/eventStore';
import { emitter } from '@/domain/logistics/common/emitter';
import { pickFailureForReceiveNode } from '@/domain/logistics/common/failures';
import { getFailureRateForStage } from '@/page/logistics/services/simulationSettings';
import type { WorkNodeAdapters } from '@/domain/logistics/common/workNodeAdvancer';

export const productionWorkNodeAdapters: WorkNodeAdapters = {
    patchTask,
    appendEvent,
    emitTaskStage: (taskId, stage) => {
        emitter.emit('logistics:task:stage', { taskId, stage });
    },
    getFailureRate: getFailureRateForStage,
    pickFailure: pickFailureForReceiveNode,
};

