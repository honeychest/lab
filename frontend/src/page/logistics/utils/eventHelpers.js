// 이벤트 처리 관련 함수들

import { EVENT_LABELS } from '../constants';
import { STAGE_LABELS, TMS_STAGE_WORK_NODES } from '@/domain/logistics/common/stages';

export function eventLabel(eventType) {
    return EVENT_LABELS[eventType] ?? eventType;
}

export function historyTmsEventLabel(event) {
    if (!event.eventType?.startsWith('dispatch.')) return null;

    if (event.payload?.receiveNodeLabel) {
        const stageName = event.payload.stage ? STAGE_LABELS[event.payload.stage] : 'TMS';
        return `${stageName}: ${event.payload.receiveNodeLabel}`;
    }

    if (!event.eventType.endsWith('.done')) return eventLabel(event.eventType);

    const parts = event.eventType.split('.');
    const doneIndex = parts.length - 1;
    const nodeKey = parts[doneIndex - 1];
    const stageKey = `TMS_${parts.slice(1, doneIndex - 1).join('_').toUpperCase()}`;
    const stageName = STAGE_LABELS[stageKey] ?? 'TMS';
    const nodeLabel = TMS_STAGE_WORK_NODES[stageKey]?.find(node => node.key === nodeKey)?.label;

    return nodeLabel ? `${stageName}: ${nodeLabel}` : eventLabel(event.eventType);
}

export function historyEventLabel(event) {
    if (event.eventType?.startsWith('order.') && event.payload?.receiveNodeLabel) {
        const stageName = event.payload.stage ? STAGE_LABELS[event.payload.stage] : 'OMS';
        return `${stageName}: ${event.payload.receiveNodeLabel}`;
    }

    if (event.eventType?.endsWith('.done') && event.eventType.startsWith('shipment.') && event.payload?.receiveNodeLabel) {
        const stageName = event.payload.stage ? STAGE_LABELS[event.payload.stage] : 'WMS';
        return `${stageName}: ${event.payload.receiveNodeLabel}`;
    }

    const tmsEventLabel = historyTmsEventLabel(event);
    if (tmsEventLabel) return tmsEventLabel;

    if ((event.eventType === 'task.failed.simulated' || event.eventType === 'task.failed.injected') && event.payload?.failureLabel) {
        return event.payload?.receiveNodeLabel
            ? `${event.payload.receiveNodeLabel} 실패: ${event.payload.failureLabel}`
            : event.payload.failureLabel;
    }

    if (event.eventType === 'task.recovered' && event.payload?.actionLabel) {
        return `조치: ${event.payload.actionLabel}`;
    }

    return eventLabel(event.eventType);
}

export function isFailureEvent(event) {
    return event.eventType === 'task.failed.simulated' || event.eventType === 'task.failed.injected';
}

export function isRecoveryEvent(event) {
    return event.eventType === 'task.recovered';
}

export function historyRowType(event, index, taskStatus) {
    if (isFailureEvent(event)) return 'fail';
    if (isRecoveryEvent(event)) return 'recover';
    if (index === 0) {
        if (taskStatus === 'failed') return 'fail';
        if (taskStatus === 'completed' || taskStatus === 'cancelled') return 'done';
        return 'current';
    }
    return 'done';
}

export function summarizeEvent(event) {
    const eventTypeLabel = historyEventLabel(event);
    if (eventTypeLabel !== event.eventType) return eventTypeLabel;

    const routingKeyLabel = eventLabel(event.routingKey);
    if (routingKeyLabel !== event.routingKey) return routingKeyLabel;

    return eventTypeLabel;
}

export function buildInjectedFailureEvent(task, type, dependencies) {
    const { generateUUID, getFailureDefinitionByCode, getOmsReceiveNodeLabel } = dependencies;
    const failure = getFailureDefinitionByCode(type);
    return {
        eventId: generateUUID(),
        eventType: 'task.failed.injected',
        routingKey: 'task.failed.injected',
        aggregateId: task.taskId,
        payload: {
            stage: task.currentStage,
            receiveNodeKey: task.receiveNodeKey,
            receiveNodeLabel: task.currentStage === 'OMS_RECEIVED' ? getOmsReceiveNodeLabel(task.receiveNodeKey) : undefined,
            failureCode: failure?.code ?? type,
            failureLabel: failure?.label ?? type,
            reason: failure?.summary ?? type,
        },
        eventVersion: '1.0',
        actor: 'operator',
        timestamp: Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:failed:${type}`,
    };
}
