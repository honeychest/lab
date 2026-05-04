// 단일 Tick Loop Scheduler — T3-ARCH 흐름 6 / REQ-T2-070 [pu→co]
// setInterval(100ms) 단일 인스턴스. setTimeout 산재 금지 (리스크-3)
// window 전역 1개 — 유령 진행·메모리 누수 방지

import { dlog, dtag } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getActiveTasks, patchTask, updateTaskStage, updateTaskStatus } from '@/store/taskStore';
import { appendEvent } from '@/store/eventStore';
import { applyAutoFocus, getFocusedTaskId } from '@/store/focusStore';
import {
    getInitialOmsStageWorkNodeKey,
    getNextOmsStageWorkNodeKey,
    getOmsStageWorkNodeLabel,
    OMS_RECEIVE_NODE_TICKS,
    getInitialTmsStageWorkNodeKey,
    getNextTmsStageWorkNodeKey,
    getTmsStageWorkNodeLabel,
    TMS_WORK_NODE_TICKS,
    getInitialWmsStageWorkNodeKey,
    getNextWmsStageWorkNodeKey,
    getWmsStageWorkNodeLabel,
    WMS_WORK_NODE_TICKS,
    getStageTicks,
    PIPELINE_STAGES,
    randomTicks,
    STAGE_ROUTING_KEY,
    getFinalStageForTask,
    getPipelineStagesForTask,
} from '@/domain/logistics/common/stages';
import type { LogisticsTask, OmsReceiveNodeKey, TmsWorkNodeKey, WmsWorkNodeKey, OmsStage, TmsStage, WmsOutStage, TaskStage } from '@/domain/logistics/common/events';
import generateUUID from '@/shared/lib/generateUUID';
import { getFailureRateForStage } from '@/page/logistics/services/simulationSettings';
import { hasFailureCandidates, pickFailureForReceiveNode, pickFailureForStage } from '@/domain/logistics/common/failures';

// 인메모리 틱 카운터 — Dexie는 단계 전이 시에만 기록 (100ms 반복 I/O 방지)
interface TickState {
    ticks: number;
    target: number;
    paused: boolean;
}
const _states = new Map<string, TickState>();

let _intervalId: ReturnType<typeof setInterval> | null = null;
let _processing = false;

function tick(): void {
    if (_processing) return;
    _processing = true;
    processTasks()
        .catch((err) => dlog(1, 'tickLoop.tick — 오류', err))
        .finally(() => { _processing = false; });
}

async function processTasks(): Promise<void> {
    const tasks = await getActiveTasks();

    // 루프에 없는 신규 Task 동기화
    for (const task of tasks) {
        if (!_states.has(task.taskId)) {
            const target = getStageTicks(task.currentStage as TaskStage);
            if (task.ticksTarget !== target) {
                await patchTask(task.taskId, { ticksTarget: target });
            }
            _states.set(task.taskId, {
                ticks: task.ticksInCurrentStage,
                target,
                paused: task.status === 'paused',
            });
        }
    }

    for (const task of tasks) {
        const state = _states.get(task.taskId);
        if (!state) continue;
        const target = getStageTicks(task.currentStage as TaskStage);
        if (state.target !== target) {
            state.target = target;
            await patchTask(task.taskId, { ticksTarget: target });
        }

        // 일시정지: 카운터 동결 (DECISION-LOG [T3-2] / 흐름 6)
        if (state.paused || task.status === 'paused') continue;
        if (task.status !== 'active') {
            _states.delete(task.taskId);
            continue;
        }

        state.ticks += 1;

        if (state.ticks >= state.target) {
            _states.delete(task.taskId);
            await advanceStage(task);
        }
    }
}

async function advanceStage(task: LogisticsTask): Promise<void> {
    if (await advanceOmsWorkNode(task)) return;
    if (await advanceWmsWorkNode(task)) return;
    if (await advanceTmsWorkNode(task)) return;

    const isWorkNodeStage = task.currentStage.startsWith('OMS_') || task.currentStage.startsWith('TMS_') || task.currentStage.startsWith('WMS_');
    if (!isWorkNodeStage && shouldFailAtStage(task, task.currentStage)) {
        await failTask(task, task.currentStage);
        return;
    }

    const pipelineStages = getPipelineStagesForTask(task);
    const finalStage = getFinalStageForTask(task);

    if (task.currentStage === finalStage) {
        await updateTaskStatus(task.taskId, 'completed');
        await publishEvent(task, task.currentStage);
        return;
    }

    const idx = pipelineStages.indexOf(task.currentStage as TaskStage);
    const nextStage = pipelineStages[idx + 1];
    if (!nextStage) {
        dlog(1, 'tickLoop.advanceStage — 파이프라인 끝 도달', task.taskId, task.currentStage);
        return;
    }

    if (task.currentStage === 'INBOUND_VALIDATED') {
        dtag(2, ['logistics', 'wms', 'inventory'], '입고 Zone 잔여 용량 기반 배정 실로직 블록', task.taskId);
        dlog(2, 'tickLoop.advanceStage — 입고 Zone 잔여 용량 기반 배정 실로직 교체 지점 (REQ-T2-015 [pu→co])', task.taskId);
    }
    if (task.currentStage === 'INBOUND_ZONE_ASSIGNED') {
        dtag(2, ['logistics', 'wms', 'inventory'], '입고 재고 반영과 Lot/FEFO 실로직 블록', task.taskId);
        dlog(2, 'tickLoop.advanceStage — 입고 재고 반영/Lot/FEFO 실로직 교체 지점 (REQ-T2-016 [pu→co])', task.taskId);
    }
    if (task.currentStage === 'OMS_RECEIVED') {
        dtag(2, ['logistics', 'oms', 'validation'], 'OMS 검증 규칙 4종 실로직 블록', task.taskId);
        dlog(2, 'tickLoop.advanceStage — OMS 검증 규칙 4종 실로직 교체 지점 (REQ-T2-002 [pu→co])', task.taskId);
    }
    if (task.currentStage === 'WMS_RECEIVED') {
        dtag(2, ['logistics', 'wms', 'inventory'], 'WMS 재고 할당/차감/경합 제어 실로직 블록', task.taskId);
        dlog(2, 'tickLoop.advanceStage — WMS 재고 할당/차감/경합 제어 실로직 교체 지점 (REQ-T2-007 [pu→co])', task.taskId);
    }
    if (task.currentStage === 'WMS_ALLOCATED') {
        dtag(2, ['logistics', 'wms', 'ops'], '피킹 작업자 배정과 경로 계산 실로직 블록', task.taskId);
        dlog(2, 'tickLoop.advanceStage — PickOrder/작업자 배정/피킹 경로 실로직 교체 지점 (REQ-T2-008 [pu→co])', task.taskId);
    }
    if (task.currentStage === 'TMS_REQUESTED') {
        dtag(2, ['logistics', 'tms', 'dispatch'], '차량 가용성과 경로 비용 기반 배차 실로직 블록', task.taskId);
        dlog(2, 'tickLoop.advanceStage — 차량 가용성/경로 비용 기반 배차 실로직 교체 지점 (REQ-T2-020 [pu→co])', task.taskId);
    }

    const ticks = getStageTicks(nextStage);
    const stagePatch: Partial<LogisticsTask> = {};
    if (nextStage === 'INBOUND_ZONE_ASSIGNED') {
        const zoneIndex = (Math.floor(Math.random() * 10) + 1).toString().padStart(2, '0');
        stagePatch.zoneCode = `Z-${zoneIndex}`;
        stagePatch.zoneTemperature = task.itemCode.includes('냉동')
            ? '냉동'
            : task.itemCode.includes('냉장')
                ? '냉장'
                : task.itemCode.includes('대형')
                    ? '대형'
                    : '상온';
    }
    if (nextStage === 'TMS_VEHICLE_ASSIGNED') {
        stagePatch.vehicleId = `VEH-${String(Math.floor(Math.random() * 5) + 1).padStart(2, '0')}`;
    }
    if (nextStage === 'WMS_PACKED') {
        stagePatch.boxId = `BOX-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    }
    const isNextOmsStage = nextStage.startsWith('OMS_');
    const isNextWmsStage = nextStage.startsWith('WMS_');
    const isNextTmsStage = nextStage.startsWith('TMS_');
    if (isNextOmsStage) {
        stagePatch.receiveNodeKey = getInitialOmsStageWorkNodeKey(nextStage as OmsStage);
    }
    if (isNextWmsStage) {
        stagePatch.receiveNodeKey = getInitialWmsStageWorkNodeKey(nextStage as WmsOutStage);
    }
    if (isNextTmsStage) {
        stagePatch.receiveNodeKey = getInitialTmsStageWorkNodeKey(nextStage as TmsStage);
    }
    const nextTicks = isNextOmsStage ? OMS_RECEIVE_NODE_TICKS : isNextWmsStage ? WMS_WORK_NODE_TICKS : isNextTmsStage ? TMS_WORK_NODE_TICKS : ticks;
    await updateTaskStage(task.taskId, nextStage, nextTicks);
    if (Object.keys(stagePatch).length > 0) {
        await patchTask(task.taskId, stagePatch);
    }
    await publishEvent(task, nextStage);

    _states.set(task.taskId, { ticks: 0, target: nextTicks, paused: false });

    // 첫 Task 자동 포커스 (DECISION-LOG [7])
    if (getFocusedTaskId() === null) {
        applyAutoFocus(task.taskId);
    }
}

async function advanceOmsWorkNode(task: LogisticsTask): Promise<boolean> {
    if (task.type !== 'ORDER' || !task.currentStage.startsWith('OMS_')) return false;
    const currentStage = task.currentStage as OmsStage;

    const receiveNodeKey = task.receiveNodeKey;
    if (shouldFailAtOmsWorkNode(task, currentStage, receiveNodeKey)) {
        await failTask(task, task.currentStage, receiveNodeKey);
        return true;
    }

    await publishOmsWorkNodeEvent(task, currentStage, receiveNodeKey);

    const nextReceiveNodeKey = getNextOmsStageWorkNodeKey(currentStage, receiveNodeKey);
    if (!nextReceiveNodeKey) return false;

    await patchTask(task.taskId, {
        receiveNodeKey: nextReceiveNodeKey,
        ticksInCurrentStage: 0,
        ticksTarget: OMS_RECEIVE_NODE_TICKS,
    });
    _states.set(task.taskId, { ticks: 0, target: OMS_RECEIVE_NODE_TICKS, paused: false });
    return true;
}

async function advanceTmsWorkNode(task: LogisticsTask): Promise<boolean> {
    if (task.type !== 'ORDER' || !task.currentStage.startsWith('TMS_')) return false;
    const currentStage = task.currentStage as TmsStage;
    const receiveNodeKey = task.receiveNodeKey as TmsWorkNodeKey | undefined;

    if (shouldFailAtTmsWorkNode(task, currentStage, receiveNodeKey)) {
        await failTask(task, task.currentStage, receiveNodeKey);
        return true;
    }

    await publishTmsWorkNodeEvent(task, currentStage, receiveNodeKey);

    const nextReceiveNodeKey = getNextTmsStageWorkNodeKey(currentStage, receiveNodeKey);
    if (!nextReceiveNodeKey) return false;

    await patchTask(task.taskId, {
        receiveNodeKey: nextReceiveNodeKey,
        ticksInCurrentStage: 0,
        ticksTarget: TMS_WORK_NODE_TICKS,
    });
    _states.set(task.taskId, { ticks: 0, target: TMS_WORK_NODE_TICKS, paused: false });
    return true;
}

async function advanceWmsWorkNode(task: LogisticsTask): Promise<boolean> {
    if (task.type !== 'ORDER' || !task.currentStage.startsWith('WMS_')) return false;
    const currentStage = task.currentStage as WmsOutStage;
    const receiveNodeKey = task.receiveNodeKey as WmsWorkNodeKey | undefined;

    if (shouldFailAtWmsWorkNode(task, currentStage, receiveNodeKey)) {
        await failTask(task, task.currentStage, receiveNodeKey);
        return true;
    }

    await publishWmsWorkNodeEvent(task, currentStage, receiveNodeKey);

    const nextReceiveNodeKey = getNextWmsStageWorkNodeKey(currentStage, receiveNodeKey);
    if (!nextReceiveNodeKey) return false;

    await patchTask(task.taskId, {
        receiveNodeKey: nextReceiveNodeKey,
        ticksInCurrentStage: 0,
        ticksTarget: WMS_WORK_NODE_TICKS,
    });
    _states.set(task.taskId, { ticks: 0, target: WMS_WORK_NODE_TICKS, paused: false });
    return true;
}

async function publishWmsWorkNodeEvent(task: LogisticsTask, stage: WmsOutStage, receiveNodeKey?: WmsWorkNodeKey): Promise<void> {
    const safeKey = receiveNodeKey ?? getInitialWmsStageWorkNodeKey(stage);
    const routingKey = `shipment.${stage.toLowerCase().replace('wms_', '').replaceAll('_', '.')}.${safeKey}.done`;
    dtag(2, ['logistics', 'wms', 'event'], 'WMS 내부 작업 완료 이벤트 발행 블록', task.taskId, stage, safeKey);
    dlog(2, 'tickLoop.publishWmsWorkNodeEvent — WMS 내부 작업별 이벤트/MQ 교체 지점', task.taskId, stage, safeKey);
    await appendEvent({
        eventId:       generateUUID(),
        eventType:     routingKey,
        routingKey,
        aggregateId:   task.taskId,
        payload:       {
            stage,
            receiveNodeKey: safeKey,
            receiveNodeLabel: getWmsStageWorkNodeLabel(stage, safeKey),
            owner: task.owner,
            itemCode: task.itemCode,
            zoneCode: task.zoneCode,
            boxId: task.boxId,
            destination: task.destination,
        },
        eventVersion:  '1.0',
        actor:         task.actor,
        timestamp:     Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:${stage}:${safeKey}`,
    });
    emitter.emit('logistics:task:stage', { taskId: task.taskId, stage });
}

async function publishTmsWorkNodeEvent(task: LogisticsTask, stage: TmsStage, receiveNodeKey?: TmsWorkNodeKey): Promise<void> {
    const safeKey = receiveNodeKey ?? getInitialTmsStageWorkNodeKey(stage);
    const routingKey = `dispatch.${stage.toLowerCase().replace('tms_', '').replaceAll('_', '.')}.${safeKey}.done`;
    dtag(2, ['logistics', 'tms', 'event'], 'TMS 내부 작업 완료 이벤트 발행 블록', task.taskId, stage, safeKey);
    dlog(2, 'tickLoop.publishTmsWorkNodeEvent — TMS 내부 작업별 이벤트/MQ 교체 지점', task.taskId, stage, safeKey);
    await appendEvent({
        eventId:       generateUUID(),
        eventType:     routingKey,
        routingKey,
        aggregateId:   task.taskId,
        payload:       {
            stage,
            receiveNodeKey: safeKey,
            receiveNodeLabel: getTmsStageWorkNodeLabel(stage, safeKey),
            owner: task.owner,
            itemCode: task.itemCode,
            vehicleId: task.vehicleId,
            destination: task.destination,
        },
        eventVersion:  '1.0',
        actor:         task.actor,
        timestamp:     Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:${stage}:${safeKey}`,
    });
    emitter.emit('logistics:task:stage', { taskId: task.taskId, stage });
}

function shouldFailAtTmsWorkNode(task: LogisticsTask, stage: TaskStage, receiveNodeKey?: TmsWorkNodeKey): boolean {
    if (!hasFailureCandidates(stage)) return false;
    const failureRate = getFailureRateForStage(stage, {
        globalFailureRate: task.simulationGlobalFailureRate,
        stageOverrides: task.simulationStageOverrides,
    });
    if (failureRate <= 0) return false;
    return Math.random() * 100 < failureRate && Boolean(pickFailureForReceiveNode(stage, receiveNodeKey));
}

function shouldFailAtWmsWorkNode(task: LogisticsTask, stage: TaskStage, receiveNodeKey?: WmsWorkNodeKey): boolean {
    if (!hasFailureCandidates(stage)) return false;
    const failureRate = getFailureRateForStage(stage, {
        globalFailureRate: task.simulationGlobalFailureRate,
        stageOverrides: task.simulationStageOverrides,
    });
    if (failureRate <= 0) return false;
    return Math.random() * 100 < failureRate && Boolean(pickFailureForReceiveNode(stage, receiveNodeKey));
}

function shouldFailAtStage(task: LogisticsTask, stage: TaskStage): boolean {
    if (!hasFailureCandidates(stage)) return false;
    const failureRate = getFailureRateForStage(stage, {
        globalFailureRate: task.simulationGlobalFailureRate,
        stageOverrides: task.simulationStageOverrides,
    });

    if (failureRate <= 0) return false;
    return Math.random() * 100 < failureRate;
}

function shouldFailAtOmsWorkNode(task: LogisticsTask, stage: TaskStage, receiveNodeKey?: OmsReceiveNodeKey): boolean {
    if (!hasFailureCandidates(stage)) return false;
    const failureRate = getFailureRateForStage(stage, {
        globalFailureRate: task.simulationGlobalFailureRate,
        stageOverrides: task.simulationStageOverrides,
    });

    if (failureRate <= 0) return false;
    return Math.random() * 100 < failureRate && Boolean(pickFailureForReceiveNode(stage, receiveNodeKey));
}

function getWorkNodeLabel(stage: TaskStage, receiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey): string | undefined {
    if (!receiveNodeKey) return undefined;
    if (stage.startsWith('OMS_')) return getOmsStageWorkNodeLabel(stage as OmsStage, receiveNodeKey as OmsReceiveNodeKey);
    if (stage.startsWith('TMS_')) return getTmsStageWorkNodeLabel(stage as TmsStage, receiveNodeKey as TmsWorkNodeKey);
    if (stage.startsWith('WMS_')) return getWmsStageWorkNodeLabel(stage as WmsOutStage, receiveNodeKey as WmsWorkNodeKey);
    return undefined;
}

async function failTask(task: LogisticsTask, stage: TaskStage, receiveNodeKey?: OmsReceiveNodeKey | TmsWorkNodeKey | WmsWorkNodeKey): Promise<void> {
    const failure = receiveNodeKey ? pickFailureForReceiveNode(stage, receiveNodeKey) : pickFailureForStage(stage);
    if (!failure) return;
    dtag(2, ['logistics', 'exception', 'event'], '시뮬레이션 실패 상태 전이와 실패 이벤트 발행 블록', task.taskId, stage, receiveNodeKey ?? '-', failure.code);
    if (stage.startsWith('OMS_') && receiveNodeKey) {
        dlog(2, 'tickLoop.failTask — OMS 내부 작업 실패/조치 매핑 실로직 교체 지점', task.taskId, getOmsStageWorkNodeLabel(stage as OmsStage, receiveNodeKey), failure.code);
    }
    if (stage === 'OMS_VALIDATED') {
        dlog(2, 'tickLoop.failTask — OMS 검증 실패 사유/감사 로그 실로직 교체 지점 (REQ-T2-002 [pu→co])', task.taskId, stage);
    }
    if (stage === 'INBOUND_ZONE_ASSIGNED') {
        dlog(2, 'tickLoop.failTask — 입고 Zone 배정 실패/재배치 처리 실로직 교체 지점 (REQ-T2-015 [pu→co])', task.taskId, stage);
    }
    if (stage === 'INBOUND_STORED') {
        dlog(2, 'tickLoop.failTask — 입고 재고 반영 실패/재시도 처리 실로직 교체 지점 (REQ-T2-016 [pu→co])', task.taskId, stage);
    }
    if (stage === 'WMS_ALLOCATED') {
        dlog(2, 'tickLoop.failTask — 할당 실패 분기와 재고 경합 처리 실로직 교체 지점 (REQ-T2-007 [pu→co])', task.taskId, stage);
    }
    if (stage === 'WMS_PICKING') {
        dlog(2, 'tickLoop.failTask — 피킹 실패/품절 발견 처리 실로직 교체 지점 (REQ-T2-008 [pu→co])', task.taskId, stage);
    }
    if (stage === 'TMS_VEHICLE_ASSIGNED') {
        dlog(2, 'tickLoop.failTask — 차량 배정 경합/재배차 실로직 교체 지점 (REQ-T2-020 [pu→co])', task.taskId, stage);
    }
    if (stage.startsWith('TMS_') && receiveNodeKey) {
        dlog(2, 'tickLoop.failTask — TMS 내부 작업 실패/조치 매핑 실로직 교체 지점', task.taskId, getTmsStageWorkNodeLabel(stage as TmsStage, receiveNodeKey as TmsWorkNodeKey), failure.code);
    }
    if (stage.startsWith('WMS_') && receiveNodeKey) {
        dlog(2, 'tickLoop.failTask — WMS 내부 작업 실패/조치 매핑 실로직 교체 지점', task.taskId, getWmsStageWorkNodeLabel(stage as WmsOutStage, receiveNodeKey as WmsWorkNodeKey), failure.code);
    }
    _states.delete(task.taskId);
    await patchTask(task.taskId, {
        status: 'failed',
        failureReason: failure.summary,
        failureCode: failure.code,
        failureLabel: failure.label,
        failureReceiveNodeKey: receiveNodeKey,
        failureDomain: failure.domain,
        failureType: failure.type,
        failureRecoverable: failure.recoverable,
        failureActions: failure.actions,
        failureResumePolicy: failure.resumePolicy,
    });
    await appendEvent({
        eventId: generateUUID(),
        eventType: 'task.failed.simulated',
        routingKey: 'task.failed.simulated',
        aggregateId: task.taskId,
        payload: {
            stage,
            receiveNodeKey,
            receiveNodeLabel: getWorkNodeLabel(stage, receiveNodeKey),
            failureCode: failure.code,
            failureLabel: failure.label,
            reason: failure.summary,
            failureRate: getFailureRateForStage(stage, {
                globalFailureRate: task.simulationGlobalFailureRate,
                stageOverrides: task.simulationStageOverrides,
            }),
        },
        eventVersion: '1.0',
        actor: task.actor,
        timestamp: Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:${stage}:${failure.code}`,
    });
    emitter.emit('logistics:task:updated', { taskId: task.taskId });
}

async function publishOmsWorkNodeEvent(task: LogisticsTask, stage: OmsStage, receiveNodeKey?: OmsReceiveNodeKey): Promise<void> {
    const safeKey = receiveNodeKey ?? getInitialOmsStageWorkNodeKey(stage);
    const routingKey = `order.${stage.toLowerCase().replace('oms_', '').replaceAll('_', '.')}.${safeKey}.done`;
    dtag(2, ['logistics', 'oms', 'event'], 'OMS 내부 작업 완료 이벤트 발행 블록', task.taskId, stage, safeKey);
    dlog(2, 'tickLoop.publishOmsWorkNodeEvent — OMS 내부 작업별 이벤트/MQ 교체 지점', task.taskId, stage, safeKey);
    await appendEvent({
        eventId:       generateUUID(),
        eventType:     routingKey,
        routingKey,
        aggregateId:   task.taskId,
        payload:       {
            stage,
            receiveNodeKey: safeKey,
            receiveNodeLabel: getOmsStageWorkNodeLabel(stage, safeKey),
            owner: task.owner,
            itemCode: task.itemCode,
            type: task.type,
        },
        eventVersion:  '1.0',
        actor:         task.actor,
        timestamp:     Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:${stage}:${safeKey}`,
    });
    emitter.emit('logistics:task:stage', { taskId: task.taskId, stage });
}

async function publishEvent(task: LogisticsTask, stage: TaskStage): Promise<void> {
    const routingKey = STAGE_ROUTING_KEY[stage] ?? `unknown.${stage.toLowerCase()}`;
    dtag(2, ['logistics', 'event', 'scheduler'], '단계 전이 이벤트 발행 어댑터 교체 블록', task.taskId, routingKey);
    dlog(2, 'tickLoop.publishEvent — 단계2부터 EventEmitter→MQ/WS 발행 어댑터 교체 지점 (REQ-T2-049 [pu→co])', task.taskId, routingKey);
    await appendEvent({
        eventId:       generateUUID(),
        eventType:     routingKey,
        routingKey,
        aggregateId:   task.taskId,
        payload:       { stage, owner: task.owner, itemCode: task.itemCode, type: task.type, zoneCode: task.zoneCode, vehicleId: task.vehicleId, boxId: task.boxId },
        eventVersion:  '1.0',
        actor:         task.actor,
        timestamp:     Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:${stage}`,
    });
    emitter.emit('logistics:task:stage', { taskId: task.taskId, stage });
}

export function pauseTask(taskId: string): void {
    const state = _states.get(taskId);
    if (state) state.paused = true;
}

export function resumeTask(taskId: string): void {
    const state = _states.get(taskId);
    if (state) state.paused = false;
    dtag(2, ['logistics', 'recovery', 'scheduler'], '중단 시점 복원과 재개 정책 실로직 블록', taskId);
    dlog(1, 'tickLoop.resumeTask — pu 스텁: 현재 단계 처음부터 재개 (DECISION-LOG [T3-2], co에서 중단 시점 복원)');
    dlog(2, 'tickLoop.resumeTask — co에서 pausedAt 기준 중단 시점 복원 로직 연결 지점 (REQ-T2-037 [pu→co])', taskId);
}

export function removeTask(taskId: string): void {
    _states.delete(taskId);
}

export function seedTickState(taskId: string, target = randomTicks()): void {
    _states.set(taskId, { ticks: 0, target, paused: false });
}

export function getTickProgress(taskId: string): number {
    const s = _states.get(taskId);
    if (!s || s.target === 0) return 0;
    return Math.min(s.ticks / s.target, 1);
}

export function startTickLoop(): void {
    if (_intervalId !== null) return;
    _intervalId = setInterval(tick, 100);
    dlog(1, 'tickLoop.start — 단일 Tick Loop 시작 (100ms)');
}

export function stopTickLoop(): void {
    if (_intervalId === null) return;
    clearInterval(_intervalId);
    _intervalId = null;
    dlog(1, 'tickLoop.stop — Tick Loop 정지');
}

export function isTickLoopRunning(): boolean {
    return _intervalId !== null;
}
