import { dlog, dtag } from '@/global/chs';
import { appendAuditEvent } from '@/store/auditStore';
import { appendEvent } from '@/store/eventStore';
import { patchTask } from '@/store/taskStore';
import { removeTask, resumeTask } from '@/scheduler/tickLoop';
import { INBOUND_STAGES, PIPELINE_STAGES } from '@/domain/logistics/common/stages';
import generateUUID from '@/shared/lib/generateUUID';

function previousStage(stage) {
    const stages = stage.startsWith('INBOUND_') ? INBOUND_STAGES : PIPELINE_STAGES;
    const index = stages.indexOf(stage);
    if (index <= 0) return stage;
    return stages[index - 1];
}

function buildRecoveryEvent(task, action, targetStage) {
    return {
        eventId: generateUUID(),
        eventType: 'task.recovered',
        routingKey: 'task.recovered',
        aggregateId: task.taskId,
        payload: {
            actionId: action.id,
            actionLabel: action.label,
            nextStage: targetStage,
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

    await patchTask(task.taskId, {
        status: action.id === 'cancel_order' ? 'cancelled' : 'active',
        currentStage: action.id === 'cancel_order' ? task.currentStage : targetStage,
        ticksInCurrentStage: 0,
        ticksTarget: task.ticksTarget,
        failureReason: undefined,
        failureCode: undefined,
        failureLabel: undefined,
        failureDomain: undefined,
        failureType: undefined,
        failureRecoverable: undefined,
        failureActions: undefined,
        failureResumePolicy: undefined,
    });

    await appendEvent(buildRecoveryEvent(task, action, targetStage));
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
        resumeTask(task.taskId);
    }

    dlog(1, `Logistics.recovery — ${action.label}`);
    dlog(2, 'Logistics.recovery — co에서 조치 결과 audit/event 영속 규칙 연결 지점 (REQ-T2-049 [pu→co])', task.taskId, action.id);
}
