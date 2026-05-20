import { dlog, dtag } from '@/global/chs';
import { logisticsQueue } from '@/domain/logistics/common/queue';
import {
    getInitialOmsStageWorkNodeKey,
    getNextOmsStageWorkNodeKey,
    getOmsStageWorkNodeLabel,
    OMS_RECEIVE_NODE_TICKS,
} from '@/domain/logistics/common/stages';
import type { OmsStage, OmsReceiveNodeKey } from '@/domain/logistics/common/events';
import { createWorkNodeAdvancer } from '@/domain/logistics/common/workNodeAdvancer';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks as OmsWorkNodeCallbacks };

export const advanceOmsWorkNode = createWorkNodeAdvancer({
    stagePrefix: 'OMS_',
    taskType: 'ORDER',
    workNodeTicks: OMS_RECEIVE_NODE_TICKS,
    getInitialKey: (s) => getInitialOmsStageWorkNodeKey(s as OmsStage),
    getNextKey: (s, k) => getNextOmsStageWorkNodeKey(s as OmsStage, k as OmsReceiveNodeKey | undefined),
    getLabel: (s, k) => getOmsStageWorkNodeLabel(s as OmsStage, k as OmsReceiveNodeKey),
    routingKeyPrefix: 'order.',
    stageLowerPrefix: 'oms_',
    dtags: ['logistics', 'oms', 'event'],
    dlogContext: 'oms.consumer.publishOmsWorkNodeEvent',
    buildPayload: (task) => ({ owner: task.owner, itemCode: task.itemCode, type: task.type }),
});

let _unsubscribe: (() => void) | null = null;

export function startOmsConsumer(): void {
    if (_unsubscribe) return;
    _unsubscribe = logisticsQueue.subscribe(
        'order.*',
        (message) => {
            dtag(2, ['logistics', 'oms', 'queue'], 'OMS 큐 메시지 수신', message.taskId ?? '-', message.routingKey);
            dlog(2, 'oms.consumer — order.* 수신 (side-effect 확장 지점)', message.routingKey, message.taskId);
        },
        { consumerId: 'oms-domain-consumer' },
    );
    dlog(1, 'oms.consumer — OMS 도메인 consumer 등록 완료 (order.*)');
}

export function stopOmsConsumer(): void {
    _unsubscribe?.();
    _unsubscribe = null;
}
