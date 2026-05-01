import mitt from 'mitt';
import type { LogisticEvent, LogisticsTask, HealthAxis, HealthStatus } from './events';

type EmitterEvents = {
    'logistics:event':             LogisticEvent;
    'logistics:task:created':      LogisticsTask;
    'logistics:task:updated':      { taskId: string };
    'logistics:task:stage':        { taskId: string; stage: string };
    'logistics:focus:changed':     { taskId: string | null };
    'logistics:health:changed':    { axis: HealthAxis; status: HealthStatus };
    'logistics:retention:full':    void;
    'logistics:retention:cleared': void;
    'logistics:kpi:updated':       void;
};

export const emitter = mitt<EmitterEvents>();
export type { EmitterEvents };
