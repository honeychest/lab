import { dlog, dtag } from '@/global/chs';
import { logisticsQueue } from '@/domain/logistics/common/queue';
import {
    getInitialEosStageWorkNodeKey,
    getNextEosStageWorkNodeKey,
    getEosStageWorkNodeLabel,
    EOS_WORK_NODE_TICKS,
} from '@/domain/logistics/common/stages';
import type { EosStage, EosWorkNodeKey } from '@/domain/logistics/common/events';
import { createWorkNodeAdvancer } from '@/domain/logistics/common/workNodeAdvancer';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks as EosWorkNodeCallbacks };

export const advanceEosWorkNode = createWorkNodeAdvancer({
    stagePrefix: 'EOS_',
    taskType: 'EOS',
    workNodeTicks: EOS_WORK_NODE_TICKS,
    getInitialKey: (s) => getInitialEosStageWorkNodeKey(s as EosStage),
    getNextKey: (s, k) => getNextEosStageWorkNodeKey(s as EosStage, k as EosWorkNodeKey | undefined),
    getLabel: (s, k) => getEosStageWorkNodeLabel(s as EosStage, k as EosWorkNodeKey),
    routingKeyPrefix: 'eos.',
    stageLowerPrefix: 'eos_',
    dtags: ['logistics', 'eos', 'event', 'scheduler'],
    dlogContext: 'eos.consumer.publishEosWorkNodeEvent',
    buildPayload: (task) => ({
        owner: task.owner,
        itemCode: task.itemCode,
        quantity: task.quantity,
    }),
});

let _unsubscribe: (() => void) | null = null;

export function startEosConsumer(): void {
    if (_unsubscribe) return;
    _unsubscribe = logisticsQueue.subscribe(
        'eos.*',
        (message) => {
            dtag(2, ['logistics', 'eos', 'queue'], 'EOS 큐 메시지 수신', message.taskId ?? '-', message.routingKey);
            dlog(2, 'eos.consumer — eos.* 수신 (side-effect 확장 지점)', message.routingKey, message.taskId);
        },
        { consumerId: 'eos-domain-consumer' },
    );
    dlog(1, 'eos.consumer — EOS 도메인 consumer 등록 완료 (eos.*)');
}

export function stopEosConsumer(): void {
    _unsubscribe?.();
    _unsubscribe = null;
}
