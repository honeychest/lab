export type QueueMessageStatus = 'unhandled' | 'pending' | 'processing' | 'done' | 'failed';

export interface QueueEnvelope<TPayload = Record<string, unknown>> {
    id: string;
    routingKey: string;
    taskId?: string;
    stage?: string;
    at: number;
    payload: TPayload;
    deliveries: QueueDeliverySnapshot[];
}

export interface QueueDeliverySnapshot {
    consumerId: string;
    pattern: string;
    status: Exclude<QueueMessageStatus, 'unhandled'>;
    startedAt: number | null;
    finishedAt: number | null;
    error: string | null;
}

export interface QueueMessageFilter {
    routingKey?: string;
    pattern?: string;
    taskId?: string;
    status?: QueueMessageStatus;
    limit?: number;
}

export interface QueueDomainSummary {
    unhandled: number;
    pending: number;
    processing: number;
    done: number;
    failed: number;
    total: number;
}

export interface QueueConsumerSnapshot {
    consumerId: string;
    pattern: string;
}

export interface QueueSnapshot {
    messages: QueueEnvelope[];
    byDomain: Record<string, QueueDomainSummary>;
    totals: QueueDomainSummary;
    consumers: QueueConsumerSnapshot[];
}

export interface QueueSubscribeOptions {
    consumerId?: string;
}

type QueueHandler<TPayload = Record<string, unknown>> =
    (message: QueueEnvelope<TPayload>) => void | Promise<void>;

type SnapshotListener = (snapshot: QueueSnapshot) => void;

type QueueConsumer = {
    consumerId: string;
    pattern: string;
    handler: QueueHandler;
};

const EMPTY_SUMMARY = Object.freeze({
    unhandled: 0,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    total: 0,
});

function cloneSummary(summary: QueueDomainSummary): QueueDomainSummary {
    return { ...summary };
}

function createSummary(): QueueDomainSummary {
    return cloneSummary(EMPTY_SUMMARY);
}

function deriveDomain(routingKey: string): string {
    const [domain] = routingKey.split('.');
    return domain || 'unknown';
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesPattern(pattern: string, routingKey: string): boolean {
    const matcher = `^${escapeRegex(pattern).replace(/\\\*/g, '[^.]+')}$`;
    return new RegExp(matcher).test(routingKey);
}

function getEnvelopeStatus(message: QueueEnvelope): QueueMessageStatus {
    if (message.deliveries.length === 0) return 'unhandled';
    if (message.deliveries.some((delivery) => delivery.status === 'failed')) return 'failed';
    if (message.deliveries.some((delivery) => delivery.status === 'processing')) return 'processing';
    if (message.deliveries.every((delivery) => delivery.status === 'done')) return 'done';
    return 'pending';
}

function cloneEnvelope<TPayload>(message: QueueEnvelope<TPayload>): QueueEnvelope<TPayload> {
    return {
        ...message,
        payload: message.payload,
        deliveries: message.deliveries.map((delivery) => ({ ...delivery })),
    };
}

export class InMemoryQueue {
    private nextMessageId = 1;
    private nextConsumerId = 1;
    private readonly messages = new Map<string, QueueEnvelope>();
    private readonly consumers = new Map<string, QueueConsumer>();
    private readonly snapshotListeners = new Set<SnapshotListener>();

    publish<TPayload extends Record<string, unknown>>(
        routingKey: string,
        payload: TPayload,
    ): QueueEnvelope<TPayload> {
        const messageId = `queue-msg-${this.nextMessageId++}`;
        const matchedConsumers = Array.from(this.consumers.values())
            .filter((consumer) => matchesPattern(consumer.pattern, routingKey));

        const message: QueueEnvelope<TPayload> = {
            id: messageId,
            routingKey,
            taskId: typeof payload.taskId === 'string' ? payload.taskId : undefined,
            stage: typeof payload.stage === 'string' ? payload.stage : undefined,
            at: typeof payload.at === 'number' ? payload.at : Date.now(),
            payload,
            deliveries: matchedConsumers.map((consumer) => ({
                consumerId: consumer.consumerId,
                pattern: consumer.pattern,
                status: 'pending',
                startedAt: null,
                finishedAt: null,
                error: null,
            })),
        };

        this.messages.set(messageId, message);
        this.emitSnapshot();

        for (const consumer of matchedConsumers) {
            void this.runDelivery(messageId, consumer);
        }

        return cloneEnvelope(message);
    }

    subscribe<TPayload extends Record<string, unknown>>(
        pattern: string,
        handler: QueueHandler<TPayload>,
        options: QueueSubscribeOptions = {},
    ): () => void {
        const consumerId = options.consumerId || `queue-consumer-${this.nextConsumerId++}`;
        this.consumers.set(consumerId, {
            consumerId,
            pattern,
            handler: handler as QueueHandler,
        });
        this.emitSnapshot();
        return () => {
            this.consumers.delete(consumerId);
            this.emitSnapshot();
        };
    }

    subscribeSnapshot(listener: SnapshotListener): () => void {
        this.snapshotListeners.add(listener);
        listener(this.getQueueSnapshot());
        return () => {
            this.snapshotListeners.delete(listener);
        };
    }

    getMessages(filter: QueueMessageFilter = {}): QueueEnvelope[] {
        const limit = filter.limit ?? Number.POSITIVE_INFINITY;
        return Array.from(this.messages.values())
            .filter((message) => {
                if (filter.routingKey && message.routingKey !== filter.routingKey) return false;
                if (filter.pattern && !matchesPattern(filter.pattern, message.routingKey)) return false;
                if (filter.taskId && message.taskId !== filter.taskId) return false;
                if (filter.status && getEnvelopeStatus(message) !== filter.status) return false;
                return true;
            })
            .sort((left, right) => left.at - right.at)
            .slice(-limit)
            .map((message) => cloneEnvelope(message));
    }

    getQueueSnapshot(filter: QueueMessageFilter = {}): QueueSnapshot {
        const messages = this.getMessages(filter);
        const byDomain: Record<string, QueueDomainSummary> = {};
        const totals = createSummary();

        for (const message of messages) {
            const domain = deriveDomain(message.routingKey);
            const status = getEnvelopeStatus(message);
            const summary = byDomain[domain] || createSummary();

            summary[status] += 1;
            summary.total += 1;
            byDomain[domain] = summary;

            totals[status] += 1;
            totals.total += 1;
        }

        return {
            messages,
            byDomain,
            totals,
            consumers: Array.from(this.consumers.values()).map((consumer) => ({
                consumerId: consumer.consumerId,
                pattern: consumer.pattern,
            })),
        };
    }

    clearCompleted(): void {
        for (const [messageId, message] of this.messages.entries()) {
            if (getEnvelopeStatus(message) === 'done') {
                this.messages.delete(messageId);
            }
        }
        this.emitSnapshot();
    }

    clearAll(): void {
        this.messages.clear();
        this.emitSnapshot();
    }

    private async runDelivery(
        messageId: string,
        consumer: QueueConsumer,
    ): Promise<void> {
        const delivery = this.getDelivery(messageId, consumer.consumerId);
        if (!delivery) return;

        delivery.status = 'processing';
        delivery.startedAt = Date.now();
        delivery.finishedAt = null;
        delivery.error = null;
        this.emitSnapshot();

        const message = this.messages.get(messageId);
        if (!message) return;

        try {
            await consumer.handler(cloneEnvelope(message));
            const currentDelivery = this.getDelivery(messageId, consumer.consumerId);
            if (!currentDelivery) return;
            currentDelivery.status = 'done';
            currentDelivery.finishedAt = Date.now();
            this.emitSnapshot();
        } catch (error) {
            const currentDelivery = this.getDelivery(messageId, consumer.consumerId);
            if (!currentDelivery) return;
            currentDelivery.status = 'failed';
            currentDelivery.finishedAt = Date.now();
            currentDelivery.error = error instanceof Error ? error.message : String(error);
            this.emitSnapshot();
        }
    }

    private getDelivery(
        messageId: string,
        consumerId: string,
    ): QueueDeliverySnapshot | undefined {
        const message = this.messages.get(messageId);
        return message?.deliveries.find((delivery) => delivery.consumerId === consumerId);
    }

    private emitSnapshot(): void {
        const snapshot = this.getQueueSnapshot();
        for (const listener of this.snapshotListeners) {
            listener(snapshot);
        }
    }
}

export const logisticsQueue = new InMemoryQueue();
