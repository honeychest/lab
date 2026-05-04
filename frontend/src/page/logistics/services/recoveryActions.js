import { dlog, dtag } from '@/global/chs';
import { appendAuditEvent } from '@/store/auditStore';
import { appendEvent } from '@/store/eventStore';
import { patchTask } from '@/store/taskStore';
import { removeTask, resumeTask, seedTickState } from '@/scheduler/tickLoop';
import { INBOUND_STAGES, OMS_RECEIVE_NODE_TICKS, TMS_WORK_NODE_TICKS, PIPELINE_STAGES, getInitialTmsStageWorkNodeKey } from '@/domain/logistics/common/stages';
import generateUUID from '@/shared/lib/generateUUID';

function previousStage(stage) {
    const stages = stage.startsWith('INBOUND_') ? INBOUND_STAGES : PIPELINE_STAGES;
    const index = stages.indexOf(stage);
    if (index <= 0) return stage;
    return stages[index - 1];
}

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
            cancelled: action.id === 'cancel_order',
        },
        eventVersion: '1.0',
        actor: 'operator',
        timestamp: Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:recover:${action.id}`,
    };
}

export async function performRecoveryAction(task, action) {
    if (!task || !action) return;

    dtag(2, ['logistics', 'ops', 'recovery', 'event'], '운영자 복구 조치 결과 이벤트와 감사 로그 저장 블록', task.taskId, action.id);
    const targetStage = action.nextStage
        ?? (task.failureResumePolicy === 'rollback_previous_stage'
            ? previousStage(task.currentStage)
            : task.currentStage);
    const isOmsStage = targetStage.startsWith('OMS_');
    const isTmsStage = targetStage.startsWith('TMS_');
    const isSameStage = targetStage === task.currentStage;
    const targetReceiveNodeKey = (isOmsStage || isTmsStage)
        ? isSameStage
            ? (action.nextReceiveNodeKey ?? task.failureReceiveNodeKey ?? task.receiveNodeKey)
            : (action.nextReceiveNodeKey ?? (isTmsStage ? getInitialTmsStageWorkNodeKey(targetStage) : undefined))
        : undefined;
    const targetTicks = isOmsStage ? OMS_RECEIVE_NODE_TICKS
        : isTmsStage ? TMS_WORK_NODE_TICKS
        : task.ticksTarget;

    await patchTask(task.taskId, {
        status: action.id === 'cancel_order' ? 'cancelled' : 'active',
        currentStage: action.id === 'cancel_order' ? task.currentStage : targetStage,
        receiveNodeKey: action.id === 'cancel_order' ? task.receiveNodeKey : targetReceiveNodeKey,
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
        nextStage: targetStage,
    }, {
        aggregateId: task.taskId,
        correlationId: task.correlationId,
        actor: 'operator',
    });

    if (action.id === 'cancel_order') {
        removeTask(task.taskId);
    } else {
        seedTickState(task.taskId, targetTicks);
        resumeTask(task.taskId);
    }

    dlog(1, `Logistics.recovery — ${action.label}`);
    dlog(2, 'Logistics.recovery — co에서 조치 결과 audit/event 영속 규칙 연결 지점 (REQ-T2-049 [pu→co])', task.taskId, action.id);
}
