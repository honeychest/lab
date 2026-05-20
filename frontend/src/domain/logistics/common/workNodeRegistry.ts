import { advanceOmsWorkNode } from '@/domain/logistics/oms/consumer';
import { advanceWmsWorkNode } from '@/domain/logistics/wms/consumer';
import { advanceQmsWorkNode } from '@/domain/logistics/qms/consumer';
import { advanceTmsWorkNode } from '@/domain/logistics/tms/consumer';
import { advanceEosWorkNode } from '@/domain/logistics/eos/consumer';
import { advanceInboundWorkNode } from '@/domain/logistics/inbound/consumer';
import { advanceAftWorkNode } from '@/domain/logistics/aft/consumer';
import {
    getInitialOmsStageWorkNodeKey, OMS_RECEIVE_NODE_TICKS,
    getInitialWmsStageWorkNodeKey, WMS_WORK_NODE_TICKS,
    getInitialQmsStageWorkNodeKey, QMS_WORK_NODE_TICKS,
    getInitialTmsStageWorkNodeKey, TMS_WORK_NODE_TICKS,
    getInitialEosStageWorkNodeKey, EOS_WORK_NODE_TICKS,
    getInitialInboundStageWorkNodeKey, INBOUND_WORK_NODE_TICKS,
    getInitialAftStageWorkNodeKey, AFT_WORK_NODE_TICKS,
    getOmsStageWorkNodeLabel,
    getTmsStageWorkNodeLabel,
    getWmsStageWorkNodeLabel,
    getQmsStageWorkNodeLabel,
    getEosStageWorkNodeLabel,
    getInboundStageWorkNodeLabel,
    getAftStageWorkNodeLabel,
} from '@/domain/logistics/common/stages';
import type {
    LogisticsTask, TaskStage,
    OmsStage, WmsOutStage, QmsStage, TmsStage, EosStage, InboundStage, AftStage,
    OmsReceiveNodeKey, WmsWorkNodeKey, QmsWorkNodeKey, TmsWorkNodeKey, EosWorkNodeKey, InboundWorkNodeKey, AftWorkNodeKey,
} from '@/domain/logistics/common/events';
import type { WorkNodeCallbacks } from '@/domain/logistics/common/workNodeAdvancer';

export type { WorkNodeCallbacks };

export async function advanceWorkNode(task: LogisticsTask, cb: WorkNodeCallbacks): Promise<boolean> {
    if (await advanceOmsWorkNode(task, cb)) return true;
    if (await advanceWmsWorkNode(task, cb)) return true;
    if (await advanceQmsWorkNode(task, cb)) return true;
    if (await advanceTmsWorkNode(task, cb)) return true;
    if (await advanceEosWorkNode(task, cb)) return true;
    if (await advanceInboundWorkNode(task, cb)) return true;
    if (await advanceAftWorkNode(task, cb)) return true;
    return false;
}

interface StageEntry {
    prefix: string;
    getKey: (stage: TaskStage) => string;
    ticks: number;
}

const STAGE_ENTRIES: StageEntry[] = [
    { prefix: 'OMS_',     getKey: (s) => getInitialOmsStageWorkNodeKey(s as OmsStage),                       ticks: OMS_RECEIVE_NODE_TICKS },
    { prefix: 'WMS_',     getKey: (s) => getInitialWmsStageWorkNodeKey(s as WmsOutStage),                    ticks: WMS_WORK_NODE_TICKS },
    { prefix: 'QMS_',     getKey: (s) => getInitialQmsStageWorkNodeKey(s as QmsStage),                       ticks: QMS_WORK_NODE_TICKS },
    { prefix: 'TMS_',     getKey: (s) => getInitialTmsStageWorkNodeKey(s as TmsStage),                       ticks: TMS_WORK_NODE_TICKS },
    { prefix: 'EOS_',     getKey: (s) => getInitialEosStageWorkNodeKey(s as EosStage),                       ticks: EOS_WORK_NODE_TICKS },
    { prefix: 'INBOUND_', getKey: (s) => getInitialInboundStageWorkNodeKey(s as InboundStage) as string,     ticks: INBOUND_WORK_NODE_TICKS },
    { prefix: 'AFT_',     getKey: (s) => getInitialAftStageWorkNodeKey(s as AftStage),                      ticks: AFT_WORK_NODE_TICKS },
];

export function getInitialKeyForStage(stage: TaskStage): string | undefined {
    return STAGE_ENTRIES.find((e) => stage.startsWith(e.prefix))?.getKey(stage);
}

export function getWorkNodeTicksForStage(stage: TaskStage): number | undefined {
    return STAGE_ENTRIES.find((e) => stage.startsWith(e.prefix))?.ticks;
}

export function getWorkNodeLabel(stage: TaskStage, key?: string): string | undefined {
    if (!key) return undefined;
    if (stage.startsWith('OMS_'))     return getOmsStageWorkNodeLabel(stage as OmsStage, key as OmsReceiveNodeKey);
    if (stage.startsWith('TMS_'))     return getTmsStageWorkNodeLabel(stage as TmsStage, key as TmsWorkNodeKey);
    if (stage.startsWith('WMS_'))     return getWmsStageWorkNodeLabel(stage as WmsOutStage, key as WmsWorkNodeKey);
    if (stage.startsWith('QMS_'))     return getQmsStageWorkNodeLabel(stage as QmsStage, key as QmsWorkNodeKey);
    if (stage.startsWith('EOS_'))     return getEosStageWorkNodeLabel(stage as EosStage, key as EosWorkNodeKey);
    if (stage.startsWith('INBOUND_')) return getInboundStageWorkNodeLabel(stage as InboundStage, key as InboundWorkNodeKey);
    if (stage.startsWith('AFT_'))     return getAftStageWorkNodeLabel(stage as AftStage, key as AftWorkNodeKey);
    return undefined;
}
