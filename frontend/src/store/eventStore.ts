import { db } from './db';
import { emitter } from '@/domain/logistics/common/emitter';
import { dlog, dtag } from '@/global/chs';
import type { LogisticEvent } from '@/domain/logistics/common/events';

// 흐름 11: EventStoreRetentionPolicy — 단계1 차단 Adapter (T3-ARCH 결정-17)
export const EVENT_STORE_RETENTION_LIMIT = 10000;

async function checkRetention(): Promise<boolean> {
    const count = await db.events.count();
    if (count >= EVENT_STORE_RETENTION_LIMIT) {
        emitter.emit('logistics:retention:full');
        dtag(2, ['logistics', 'event', 'retention'], 'EventStore 보관 한도 차단 정책 블록', count);
        dlog(2, 'EventStoreRetentionPolicy.check — 단계2 진입 시 RabbitMQ+InMemory로 자연 폐기');
        return false;
    }
    return true;
}

export async function appendEvent(event: LogisticEvent): Promise<void> {
    dtag(2, ['logistics', 'event', 'db'], '이벤트 저장 어댑터 교체 블록', event.eventType, event.aggregateId);
    dlog(2, 'eventStore.appendEvent — co에서 IndexedDB→RabbitMQ/InMemory/MySQL 저장 어댑터 교체 지점 (REQ-T2-049 [pu→co])', event.eventType, event.aggregateId);
    const allowed = await checkRetention();
    if (!allowed) return;

    await db.events.add(event as LogisticEvent & { _id?: number });
    emitter.emit('logistics:event', event);
}

export async function getEventsByAggregate(aggregateId: string): Promise<LogisticEvent[]> {
    const rows = await db.events.where('aggregateId').equals(aggregateId).sortBy('timestamp');
    return rows.map(({ _id: _, ...e }) => e);
}

export async function getAllEvents(): Promise<LogisticEvent[]> {
    const rows = await db.events.orderBy('timestamp').toArray();
    return rows.map(({ _id: _, ...e }) => e);
}

export async function getEventCount(): Promise<number> {
    return db.events.count();
}

export async function clearEventStore(): Promise<void> {
    dlog(1, 'eventStore.clearEventStore — IndexedDB 이벤트 클리어 (운영자 초기화)');
    await db.events.clear();
    emitter.emit('logistics:retention:cleared');
}
