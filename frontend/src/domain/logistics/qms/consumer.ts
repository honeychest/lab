import { dlog, dtag } from '@/global/chs';
import { logisticsQueue } from '@/domain/logistics/common/queue';
import {
    getInitialQmsStageWorkNodeKey,
    getNextQmsStageWorkNodeKey,
    getQmsStageWorkNodeLabel,
    QMS_WORK_NODE_TICKS,
} from '@/domain/logistics/common/stages';
import type { QmsStage, QmsWorkNodeKey } from '@/domain/logistics/common/events';
import { createWorkNodeAdvancer } from '@/domain/logistics/common/workNodeAdvancer';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks as QmsWorkNodeCallbacks };

export const advanceQmsWorkNode = createWorkNodeAdvancer({
    stagePrefix: 'QMS_',
    taskType: 'ORDER',
    workNodeTicks: QMS_WORK_NODE_TICKS,
    getInitialKey: (s) => getInitialQmsStageWorkNodeKey(s as QmsStage),
    getNextKey: (s, k) => getNextQmsStageWorkNodeKey(s as QmsStage, k as QmsWorkNodeKey | undefined),
    getLabel: (s, k) => getQmsStageWorkNodeLabel(s as QmsStage, k as QmsWorkNodeKey),
    routingKeyPrefix: 'quality.',
    stageLowerPrefix: 'qms_',
    dtags: ['logistics', 'qms', 'event', 'scheduler'],
    dlogContext: 'qms.consumer.publishQmsWorkNodeEvent',
    buildPayload: (task) => ({
        owner: task.owner,
        itemCode: task.itemCode,
        quantity: task.quantity,
        boxId: task.boxId,
        destination: task.destination,
    }),
});

let _unsubscribe: (() => void) | null = null;

export function startQmsConsumer(): void {
    if (_unsubscribe) return;
    _unsubscribe = logisticsQueue.subscribe(
        'quality.*',
        (message) => {
            dtag(2, ['logistics', 'qms', 'queue'], 'QMS 큐 메시지 수신', message.taskId ?? '-', message.routingKey);
            dlog(2, 'qms.consumer — quality.* 수신 (side-effect 확장 지점)', message.routingKey, message.taskId);
        },
        { consumerId: 'qms-domain-consumer' },
    );
    dlog(1, 'qms.consumer — QMS 도메인 consumer 등록 완료 (quality.*)');
}

export function stopQmsConsumer(): void {
    _unsubscribe?.();
    _unsubscribe = null;
}
