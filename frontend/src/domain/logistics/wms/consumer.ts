import { dlog, dtag } from '@/global/chs';
import { logisticsQueue } from '@/domain/logistics/common/queue';
import {
    getInitialWmsStageWorkNodeKey,
    getNextWmsStageWorkNodeKey,
    getWmsStageWorkNodeLabel,
    WMS_WORK_NODE_TICKS,
} from '@/domain/logistics/common/stages';
import type { WmsOutStage, WmsWorkNodeKey } from '@/domain/logistics/common/events';
import { createWorkNodeAdvancer } from '@/domain/logistics/common/workNodeAdvancer';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks as WmsWorkNodeCallbacks };

export const advanceWmsWorkNode = createWorkNodeAdvancer({
    stagePrefix: 'WMS_',
    taskType: 'ORDER',
    workNodeTicks: WMS_WORK_NODE_TICKS,
    getInitialKey: (s) => getInitialWmsStageWorkNodeKey(s as WmsOutStage),
    getNextKey: (s, k) => getNextWmsStageWorkNodeKey(s as WmsOutStage, k as WmsWorkNodeKey | undefined),
    getLabel: (s, k) => getWmsStageWorkNodeLabel(s as WmsOutStage, k as WmsWorkNodeKey),
    routingKeyPrefix: 'shipment.',
    stageLowerPrefix: 'wms_',
    dtags: ['logistics', 'wms', 'event'],
    dlogContext: 'wms.consumer.publishWmsWorkNodeEvent',
    buildPayload: (task) => ({
        owner: task.owner,
        itemCode: task.itemCode,
        zoneCode: task.zoneCode,
        boxId: task.boxId,
        destination: task.destination,
    }),
});

let _unsubscribe: (() => void) | null = null;

export function startWmsConsumer(): void {
    if (_unsubscribe) return;
    _unsubscribe = logisticsQueue.subscribe(
        'shipment.*',
        (message) => {
            dtag(2, ['logistics', 'wms', 'queue'], 'WMS 큐 메시지 수신', message.taskId ?? '-', message.routingKey);
            dlog(2, 'wms.consumer — shipment.* 수신 (side-effect 확장 지점)', message.routingKey, message.taskId);
        },
        { consumerId: 'wms-domain-consumer' },
    );
    dlog(1, 'wms.consumer — WMS 도메인 consumer 등록 완료 (shipment.*)');
}

export function stopWmsConsumer(): void {
    _unsubscribe?.();
    _unsubscribe = null;
}
