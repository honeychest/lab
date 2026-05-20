import { dlog, dtag } from '@/global/chs';
import { appendAuditEvent } from '@/store/auditStore';
import { appendEvent } from '@/store/eventStore';
import { createTask, patchTask } from '@/store/taskStore';
import { removeTask, resumeTask, seedTickState } from '@/scheduler/tickLoop';
import { INBOUND_STAGES, OMS_RECEIVE_NODE_TICKS, TMS_WORK_NODE_TICKS, WMS_WORK_NODE_TICKS, QMS_WORK_NODE_TICKS, EOS_WORK_NODE_TICKS, INBOUND_WORK_NODE_TICKS, AFT_WORK_NODE_TICKS, PIPELINE_STAGES, EOS_PIPELINE, getInitialTmsStageWorkNodeKey, getInitialWmsStageWorkNodeKey, getInitialQmsStageWorkNodeKey, getInitialEosStageWorkNodeKey, getInitialInboundStageWorkNodeKey, getInitialAftStageWorkNodeKey, getOmsReceiveNodeLabel } from '@/domain/logistics/common/stages';
import { getFailureDefinitionByCode } from '@/domain/logistics/common/failures';
import { buildInjectedFailureEvent } from '../utils/eventHelpers';
import generateUUID from '@/shared/lib/generateUUID';

function previousStage(stage) {
    const stages = stage.startsWith('INBOUND_')
        ? INBOUND_STAGES
        : stage.startsWith('EOS_')
            ? EOS_PIPELINE
            : PIPELINE_STAGES;
    const index = stages.indexOf(stage);
    if (index <= 0) return stage;
    return stages[index - 1];
}

const TERMINAL_STATUS = {
    cancel_order:       'cancelled',
    dispose:            'disposed',
    return_to_supplier: 'returned',
};

function buildRecoveryEvent(task, action, targetStage, targetReceiveNodeKey) {
    return {
        eventId: generateUUID(),
        eventType: 'task.recovered',
        routingKey: 'task.recovered',
        aggregateId: task.taskId,
        payload: {
            actionId: action.id,
            actionLabel: action.label,
            nextStage: targetStage,
            nextReceiveNodeKey: targetReceiveNodeKey,
            terminal: action.id in TERMINAL_STATUS,
        },
        eventVersion: '1.0',
        actor: 'operator',
        timestamp: Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:recover:${action.id}`,
    };
}

async function performPartialShip(task, action) {
    const shipQty    = Math.max(1, Math.floor(task.quantity / 2));
    const backQty    = task.quantity - shipQty;
    const targetStage = action.nextStage ?? 'WMS_PICKING';
    const targetNodeKey = action.nextReceiveNodeKey ?? getInitialWmsStageWorkNodeKey(targetStage);
    const clearFailure = {
        failureReason: undefined, failureCode: undefined, failureLabel: undefined,
        failureReceiveNodeKey: undefined, failureDomain: undefined, failureType: undefined,
        failureRecoverable: undefined, failureActions: undefined, failureResumePolicy: undefined,
    };

    await patchTask(task.taskId, {
        quantity: shipQty,
        status: 'active',
        currentStage: targetStage,
        receiveNodeKey: targetNodeKey,
        ticksInCurrentStage: 0,
        ticksTarget: WMS_WORK_NODE_TICKS,
        ...clearFailure,
    });

    const backorderId = generateUUID();
    const backorderInitStage = 'WMS_RECEIVED';
    await createTask({
        taskId: backorderId,
        type: task.type,
        correlationId: task.correlationId,
        owner: task.owner,
        itemCode: task.itemCode,
        quantity: backQty,
        destination: task.destination,
        currentStage: backorderInitStage,
        receiveNodeKey: getInitialWmsStageWorkNodeKey(backorderInitStage),
        status: 'active',
        actor: task.actor,
        sourceChannel: task.sourceChannel,
        ownerView: task.ownerView,
        zoneCode: task.zoneCode,
        zoneTemperature: task.zoneTemperature,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        idempotencyKey: `${task.idempotencyKey}:backorder:${backorderId}`,
        ticksInCurrentStage: 0,
        ticksTarget: WMS_WORK_NODE_TICKS,
    });

    seedTickState(task.taskId, WMS_WORK_NODE_TICKS);
    resumeTask(task.taskId);
    seedTickState(backorderId, WMS_WORK_NODE_TICKS);
    resumeTask(backorderId);

    await appendEvent(buildRecoveryEvent(task, action, targetStage, targetNodeKey));
    await appendAuditEvent('audit.recovery.performed', {
        stage: task.currentStage,
        actionId: action.id,
        nextStage: targetStage,
        backorderId,
        shipQty,
        backQty,
    }, {
        aggregateId: task.taskId,
        correlationId: task.correlationId,
        actor: 'operator',
    });

    dlog(1, `Logistics.partialShip — 원본 ${shipQty}개 WMS_PICKING, 잔여 ${backQty}개 backorder(${backorderId})`);
}

export async function performBranchInject(task, failureCode) {
    if (!task || !failureCode) return;
    dtag(2, ['logistics', 'exception', 'audit'], '운영자 분기 주입 실패 처리와 감사 로그 저장 블록', task.taskId, failureCode);
    const failure = getFailureDefinitionByCode(failureCode);
    removeTask(task.taskId);
    await patchTask(task.taskId, {
        status: 'failed',
        failureReason: failure?.summary ?? failureCode,
        failureCode: failure?.code ?? failureCode,
        failureLabel: failure?.label ?? failureCode,
        failureReceiveNodeKey: task.receiveNodeKey,
        failureDomain: failure?.domain,
        failureType: failure?.type,
        failureRecoverable: failure?.recoverable ?? true,
        failureActions: failure?.actions ?? [],
        failureResumePolicy: failure?.resumePolicy,
    });
    await appendEvent(buildInjectedFailureEvent(task, failureCode, { generateUUID, getFailureDefinitionByCode, getOmsReceiveNodeLabel }));
    await appendAuditEvent('audit.branch.injected', {
        stage: task.currentStage,
        failureCode: failure?.code ?? failureCode,
    }, {
        aggregateId: task.taskId,
        correlationId: task.correlationId,
        actor: 'operator',
    });
    dlog(1, `Logistics.branchInject — 분기 주입 완료: ${failureCode}`);
}

export async function performRecoveryAction(task, action) {
    if (!task || !action) return;

    if (action.id === 'partial_ship') {
        await performPartialShip(task, action);
        return;
    }

    dtag(2, ['logistics', 'ops', 'recovery', 'event'], '운영자 복구 조치 결과 이벤트와 감사 로그 저장 블록', task.taskId, action.id);
    const targetStage = action.nextStage
        ?? (task.failureResumePolicy === 'rollback_previous_stage'
            ? previousStage(task.currentStage)
            : task.currentStage);
    const isOmsStage     = targetStage.startsWith('OMS_');
    const isWmsStage     = targetStage.startsWith('WMS_');
    const isQmsStage     = targetStage.startsWith('QMS_');
    const isTmsStage     = targetStage.startsWith('TMS_');
    const isEosStage     = targetStage.startsWith('EOS_');
    const isInboundStage = targetStage.startsWith('INBOUND_');
    const isAftStage     = targetStage.startsWith('AFT_');
    const isSameStage    = targetStage === task.currentStage;
    const targetReceiveNodeKey = (isOmsStage || isTmsStage || isWmsStage || isQmsStage || isEosStage || isInboundStage || isAftStage)
        ? isSameStage
            ? (action.nextReceiveNodeKey ?? task.failureReceiveNodeKey ?? task.receiveNodeKey)
            : (action.nextReceiveNodeKey ?? (
                  isTmsStage     ? getInitialTmsStageWorkNodeKey(targetStage)
                : isWmsStage     ? getInitialWmsStageWorkNodeKey(targetStage)
                : isQmsStage     ? getInitialQmsStageWorkNodeKey(targetStage)
                : isEosStage     ? getInitialEosStageWorkNodeKey(targetStage)
                : isInboundStage ? getInitialInboundStageWorkNodeKey(targetStage)
                : isAftStage     ? getInitialAftStageWorkNodeKey(targetStage)
                : undefined
            ))
        : undefined;
    const targetTicks = isOmsStage     ? OMS_RECEIVE_NODE_TICKS
        : isWmsStage     ? WMS_WORK_NODE_TICKS
        : isQmsStage     ? QMS_WORK_NODE_TICKS
        : isTmsStage     ? TMS_WORK_NODE_TICKS
        : isEosStage     ? EOS_WORK_NODE_TICKS
        : isInboundStage ? INBOUND_WORK_NODE_TICKS
        : isAftStage     ? AFT_WORK_NODE_TICKS
        : task.ticksTarget;

    const terminalStatus = TERMINAL_STATUS[action.id] ?? null;
    const isTerminal = terminalStatus !== null;

    await patchTask(task.taskId, {
        status: isTerminal ? terminalStatus : 'active',
        currentStage: isTerminal ? task.currentStage : targetStage,
        receiveNodeKey: isTerminal ? task.receiveNodeKey : targetReceiveNodeKey,
        ticksInCurrentStage: 0,
        ticksTarget: targetTicks,
        failureReason: undefined,
        failureCode: undefined,
        failureLabel: undefined,
        failureReceiveNodeKey: undefined,
        failureDomain: undefined,
        failureType: undefined,
        failureRecoverable: undefined,
        failureActions: undefined,
        failureResumePolicy: undefined,
    });

    await appendEvent(buildRecoveryEvent(task, action, targetStage, targetReceiveNodeKey));
    await appendAuditEvent('audit.recovery.performed', {
        stage: task.currentStage,
        actionId: action.id,
        nextStage: isTerminal ? null : targetStage,
        terminalStatus,
    }, {
        aggregateId: task.taskId,
        correlationId: task.correlationId,
        actor: 'operator',
    });

    if (isTerminal) {
        removeTask(task.taskId);
    } else {
        seedTickState(task.taskId, targetTicks);
        resumeTask(task.taskId);
    }

    dlog(1, `Logistics.recovery — ${action.label}`);
    dlog(2, 'Logistics.recovery — co에서 조치 결과 audit/event 영속 규칙 연결 지점 (REQ-T2-049 [pu→co])', task.taskId, action.id);
}
