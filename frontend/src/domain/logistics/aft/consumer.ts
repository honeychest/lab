import { dlog, dtag } from '@/global/chs';
import { logisticsQueue } from '@/domain/logistics/common/queue';
import {
    getInitialAftStageWorkNodeKey,
    getNextAftStageWorkNodeKey,
    getAftStageWorkNodeLabel,
    AFT_WORK_NODE_TICKS,
} from '@/domain/logistics/common/stages';
import type { AftStage, AftWorkNodeKey } from '@/domain/logistics/common/events';
import { createWorkNodeAdvancer } from '@/domain/logistics/common/workNodeAdvancer';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks as AftTickCallbacks };

export const advanceAftWorkNode = createWorkNodeAdvancer({
    stagePrefix: 'AFT_',
    workNodeTicks: AFT_WORK_NODE_TICKS,
    getInitialKey: (s) => getInitialAftStageWorkNodeKey(s as AftStage),
    getNextKey: (s, k) => getNextAftStageWorkNodeKey(s as AftStage, k as AftWorkNodeKey | undefined),
    getLabel: (s, k) => getAftStageWorkNodeLabel(s as AftStage, k as AftWorkNodeKey),
    routingKeyPrefix: 'aft.',
    stageLowerPrefix: 'aft_',
    dtags: ['logistics', 'aft', 'event'],
    dlogContext: 'aft.consumer.publishAftWorkNodeEvent',
    buildPayload: (task) => ({
        owner: task.owner,
        itemCode: task.itemCode,
        quantity: task.quantity,
        destination: task.destination,
    }),
});

let _unsubscribe: (() => void) | null = null;

export function startAftConsumer(): void {
    if (_unsubscribe) return;
    _unsubscribe = logisticsQueue.subscribe(
        'aft.*',
        (message) => {
            dtag(2, ['logistics', 'aft', 'queue'], 'AFT 큐 메시지 수신', message.taskId ?? '-', message.routingKey);
            dlog(2, 'aft.consumer — aft.* 수신 (정산·종결 side-effect 확장 지점)', message.routingKey, message.taskId);
        },
        { consumerId: 'aft-domain-consumer' },
    );
    dlog(1, 'aft.consumer — AFT 도메인 consumer 등록 완료 (aft.*)');
}

export function stopAftConsumer(): void {
    _unsubscribe?.();
    _unsubscribe = null;
}
