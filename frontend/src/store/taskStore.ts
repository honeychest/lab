import { db } from './db';
import { emitter } from '@/domain/logistics/common/emitter';
import { dlog } from '@/global/chs';
import type { LogisticsTask, TaskStage, TaskStatus } from '@/domain/logistics/common/events';

export async function createTask(task: LogisticsTask): Promise<void> {
    await db.tasks.put(task);
    emitter.emit('logistics:task:created', task);
    emitter.emit('logistics:kpi:updated');
}

export async function updateTaskStage(
    taskId: string,
    stage: TaskStage,
    ticksTarget: number,
): Promise<void> {
    await db.tasks.update(taskId, {
        currentStage: stage,
        ticksInCurrentStage: 0,
        ticksTarget,
        status: 'active',
        updatedAt: Date.now(),
    });
    emitter.emit('logistics:task:updated', { taskId });
    emitter.emit('logistics:task:stage', { taskId, stage });
    emitter.emit('logistics:kpi:updated');
}

export async function updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    failureReason?: string,
): Promise<void> {
    const patch: Partial<LogisticsTask> = { status, updatedAt: Date.now() };
    if (failureReason) patch.failureReason = failureReason;
    await db.tasks.update(taskId, patch);
    emitter.emit('logistics:task:updated', { taskId });
    emitter.emit('logistics:kpi:updated');
}

export async function patchTask(
    taskId: string,
    patch: Partial<LogisticsTask>,
): Promise<void> {
    await db.tasks.update(taskId, {
        ...patch,
        updatedAt: Date.now(),
    });
    emitter.emit('logistics:task:updated', { taskId });
    emitter.emit('logistics:kpi:updated');
}

export async function getActiveTasks(): Promise<LogisticsTask[]> {
    return db.tasks.where('status').anyOf(['active', 'paused']).toArray();
}

export async function getAllTasks(): Promise<LogisticsTask[]> {
    return db.tasks.orderBy('createdAt').toArray();
}

export async function getTaskById(taskId: string): Promise<LogisticsTask | undefined> {
    return db.tasks.get(taskId);
}

export async function clearAllTasks(): Promise<void> {
    dlog(1, 'taskStore.clearAllTasks — 데이터 초기화');
    await db.tasks.clear();
    emitter.emit('logistics:kpi:updated');
}
