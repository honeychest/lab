import Dexie, { type Table } from 'dexie';
import type { LogisticsTask, LogisticEvent } from '@/domain/logistics/common/events';

type StoredEvent = LogisticEvent & { _id?: number };

class LogisticsDB extends Dexie {
    tasks!: Table<LogisticsTask, string>;
    events!: Table<StoredEvent, number>;

    constructor() {
        super('LogisticsDB');
        this.version(1).stores({
            tasks:  'taskId, status, currentStage, type, owner, createdAt',
            events: '++_id, eventId, aggregateId, routingKey, timestamp, correlationId',
        });
    }
}

export const db = new LogisticsDB();
