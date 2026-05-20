import { dlog, dtag } from '@/global/chs';
import { logisticsQueue } from '@/domain/logistics/common/queue';
import {
    getInitialInboundStageWorkNodeKey,
    getNextInboundStageWorkNodeKey,
    getInboundStageWorkNodeLabel,
    INBOUND_WORK_NODE_TICKS,
} from '@/domain/logistics/common/stages';
import type { InboundStage, InboundWorkNodeKey } from '@/domain/logistics/common/events';
import { createWorkNodeAdvancer } from '@/domain/logistics/common/workNodeAdvancer';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks as InboundTickCallbacks };

// taskType 미지정: EOS task가 EOS_PO_CONFIRMED → INBOUND_RECEIVED로 stage 전환될 때
// task.type은 'EOS'인 채로 INBOUND 단계를 진행한다. taskType을 지정하면 EOS task가 걸러진다.
export const advanceInboundWorkNode = createWorkNodeAdvancer({
    stagePrefix: 'INBOUND_',
    workNodeTicks: INBOUND_WORK_NODE_TICKS,
    getInitialKey: (s) => getInitialInboundStageWorkNodeKey(s as InboundStage) as string,
    getNextKey: (s, k) => getNextInboundStageWorkNodeKey(s as InboundStage, k as InboundWorkNodeKey | undefined),
    getLabel: (s, k) => getInboundStageWorkNodeLabel(s as InboundStage, k as InboundWorkNodeKey),
    routingKeyPrefix: 'inbound.',
    stageLowerPrefix: 'inbound_',
    dtags: ['logistics', 'wms', 'inbound', 'event'],
    dlogContext: 'inbound.consumer.publishInboundWorkNodeEvent',
    buildPayload: (task) => ({
        owner: task.owner,
        itemCode: task.itemCode,
        quantity: task.quantity,
        zoneCode: task.zoneCode,
        zoneTemperature: task.zoneTemperature,
    }),
});

let _unsubscribe: (() => void) | null = null;

export function startInboundConsumer(): void {
    if (_unsubscribe) return;
    _unsubscribe = logisticsQueue.subscribe(
        'inbound.*',
        (message) => {
            dtag(2, ['logistics', 'wms', 'inbound', 'queue'], 'INBOUND 큐 메시지 수신', message.taskId ?? '-', message.routingKey);
            dlog(2, 'inbound.consumer — inbound.* 수신 (side-effect 확장 지점)', message.routingKey, message.taskId);
        },
        { consumerId: 'inbound-domain-consumer' },
    );
    dlog(1, 'inbound.consumer — INBOUND 도메인 consumer 등록 완료 (inbound.*)');
}

export function stopInboundConsumer(): void {
    _unsubscribe?.();
    _unsubscribe = null;
}
