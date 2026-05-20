import { dlog, dtag } from '@/global/chs';
import { logisticsQueue } from '@/domain/logistics/common/queue';
import {
    getInitialTmsStageWorkNodeKey,
    getNextTmsStageWorkNodeKey,
    getTmsStageWorkNodeLabel,
    TMS_WORK_NODE_TICKS,
} from '@/domain/logistics/common/stages';
import type { TmsStage, TmsWorkNodeKey } from '@/domain/logistics/common/events';
import { createWorkNodeAdvancer } from '@/domain/logistics/common/workNodeAdvancer';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks as TmsWorkNodeCallbacks };

export const advanceTmsWorkNode = createWorkNodeAdvancer({
    stagePrefix: 'TMS_',
    taskType: 'ORDER',
    workNodeTicks: TMS_WORK_NODE_TICKS,
    getInitialKey: (s) => getInitialTmsStageWorkNodeKey(s as TmsStage),
    getNextKey: (s, k) => getNextTmsStageWorkNodeKey(s as TmsStage, k as TmsWorkNodeKey | undefined),
    getLabel: (s, k) => getTmsStageWorkNodeLabel(s as TmsStage, k as TmsWorkNodeKey),
    routingKeyPrefix: 'dispatch.',
    stageLowerPrefix: 'tms_',
    dtags: ['logistics', 'tms', 'event'],
    dlogContext: 'tms.consumer.publishTmsWorkNodeEvent',
    buildPayload: (task) => ({
        owner: task.owner,
        itemCode: task.itemCode,
        vehicleId: task.vehicleId,
        destination: task.destination,
    }),
});

let _unsubscribe: (() => void) | null = null;

export function startTmsConsumer(): void {
    if (_unsubscribe) return;
    _unsubscribe = logisticsQueue.subscribe(
        'dispatch.*',
        (message) => {
            dtag(2, ['logistics', 'tms', 'queue'], 'TMS 큐 메시지 수신', message.taskId ?? '-', message.routingKey);
            dlog(2, 'tms.consumer — dispatch.* 수신 (side-effect 확장 지점)', message.routingKey, message.taskId);
        },
        { consumerId: 'tms-domain-consumer' },
    );
    dlog(1, 'tms.consumer — TMS 도메인 consumer 등록 완료 (dispatch.*)');
}

export function stopTmsConsumer(): void {
    _unsubscribe?.();
    _unsubscribe = null;
}
