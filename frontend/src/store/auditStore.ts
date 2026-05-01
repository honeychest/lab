import generateUUID from '@/shared/lib/generateUUID';
import { appendEvent } from './eventStore';

interface AuditOptions {
    aggregateId?: string;
    correlationId?: string;
    actor?: string;
}

export async function appendAuditEvent(
    eventType: string,
    payload: Record<string, unknown>,
    options: AuditOptions = {},
): Promise<void> {
    await appendEvent({
        eventId: generateUUID(),
        eventType,
        routingKey: eventType,
        aggregateId: options.aggregateId ?? 'system',
        payload,
        eventVersion: '1.0',
        actor: options.actor ?? 'operator',
        timestamp: Date.now(),
        correlationId: options.correlationId ?? generateUUID(),
        idempotencyKey: `${options.aggregateId ?? 'system'}:${eventType}:${Date.now()}`,
    });
}
