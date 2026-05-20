import { dlog, dtag } from '@/global/chs';
import generateUUID from '@/shared/lib/generateUUID';
import { productionWorkNodeAdapters } from '@/domain/logistics/common/workNodeAdapters';
import type { FailureDefinition } from '@/domain/logistics/common/failures';
import type { LogisticEvent, LogisticsTask, TaskStage } from '@/domain/logistics/common/events';

export interface WorkNodeCallbacks {
    setState(taskId: string, state: { ticks: number; target: number; paused: boolean }): void;
    onFail(task: LogisticsTask, stage: string, key?: string): Promise<void>;
}

export interface FailureRateOpts {
    globalFailureRate?: number;
    stageOverrides?: Partial<Record<TaskStage, number>>;
}

export interface WorkNodeAdapters {
    patchTask: (taskId: string, patch: Partial<LogisticsTask>) => Promise<void>;
    appendEvent: (event: LogisticEvent) => Promise<void>;
    emitTaskStage: (taskId: string, stage: TaskStage) => void;
    getFailureRate: (stage: TaskStage, opts: FailureRateOpts) => number;
    pickFailure: (stage: TaskStage, key?: string) => FailureDefinition | null;
}

export interface WorkNodeDomainConfig {
    stagePrefix: string;
    taskType?: string;
    workNodeTicks: number;
    getInitialKey: (stage: string) => string;
    getNextKey: (stage: string, key?: string) => string | null | undefined;
    getLabel: (stage: string, key: string) => string | undefined;
    routingKeyPrefix: string;
    stageLowerPrefix: string;
    dtags: string[];
    dlogContext: string;
    buildPayload: (task: LogisticsTask) => Record<string, unknown>;
}

export function createWorkNodeAdvancer(
    config: WorkNodeDomainConfig,
    adapters: WorkNodeAdapters = productionWorkNodeAdapters,
) {
    return async function advanceWorkNode(
        task: LogisticsTask,
        cb: WorkNodeCallbacks,
    ): Promise<boolean> {
        if (config.taskType && task.type !== config.taskType) return false;
        if (!task.currentStage.startsWith(config.stagePrefix)) return false;

        const stage = task.currentStage as TaskStage;
        const key = task.receiveNodeKey as string | undefined;

        if (shouldFailAtWorkNode(task, stage, key, adapters)) {
            await cb.onFail(task, stage, key);
            return true;
        }

        await publishWorkNodeEvent(task, stage, key, config, adapters);

        const nextKey = config.getNextKey(stage, key);
        if (!nextKey) return false;

        await adapters.patchTask(task.taskId, {
            receiveNodeKey: nextKey as LogisticsTask['receiveNodeKey'],
            ticksInCurrentStage: 0,
            ticksTarget: config.workNodeTicks,
        });
        cb.setState(task.taskId, { ticks: 0, target: config.workNodeTicks, paused: false });
        return true;
    };
}

function shouldFailAtWorkNode(
    task: LogisticsTask,
    stage: TaskStage,
    key: string | undefined,
    adapters: WorkNodeAdapters,
): boolean {
    const failureRate = adapters.getFailureRate(stage, {
        globalFailureRate: task.simulationGlobalFailureRate,
        stageOverrides: task.simulationStageOverrides,
    });
    if (failureRate <= 0) return false;
    return Math.random() * 100 < failureRate && Boolean(adapters.pickFailure(stage, key));
}

async function publishWorkNodeEvent(
    task: LogisticsTask,
    stage: TaskStage,
    key: string | undefined,
    config: WorkNodeDomainConfig,
    adapters: WorkNodeAdapters,
): Promise<void> {
    const safeKey = key ?? config.getInitialKey(stage);
    const routingKey = `${config.routingKeyPrefix}${stage.toLowerCase().replace(config.stageLowerPrefix, '').replaceAll('_', '.')}.${safeKey}.done`;
    dtag(2, config.dtags, `${config.stagePrefix} 내부 작업 완료 이벤트 발행 블록`, task.taskId, stage, safeKey);
    dlog(2, `${config.dlogContext} — 내부 작업별 이벤트/MQ 교체 지점`, task.taskId, stage, safeKey);
    await adapters.appendEvent({
        eventId:        generateUUID(),
        eventType:      routingKey,
        routingKey,
        aggregateId:    task.taskId,
        payload:        {
            stage,
            receiveNodeKey: safeKey,
            receiveNodeLabel: config.getLabel(stage, safeKey),
            ...config.buildPayload(task),
        },
        eventVersion:   '1.0',
        actor:          task.actor,
        timestamp:      Date.now(),
        correlationId:  task.correlationId,
        idempotencyKey: `${task.taskId}:${stage}:${safeKey}`,
    });
    adapters.emitTaskStage(task.taskId, stage);
}
