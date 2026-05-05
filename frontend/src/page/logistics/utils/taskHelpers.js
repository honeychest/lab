// 작업 계산 관련 함수들

export function tasksForStage(tasks, stage) {
    return tasks.filter(task => task.type === 'ORDER' && task.currentStage === stage);
}

export function progressPercent(task) {
    if (task?.status === 'completed') return 100;
    if (task?.status === 'failed') return 100;
    if (typeof task?.liveProgress === 'number') {
        return Math.max(6, Math.min(100, Math.round(task.liveProgress * 100)));
    }
    if (!task?.ticksTarget) return 10;
    return Math.max(10, Math.min(100, Math.round((task.ticksInCurrentStage / task.ticksTarget) * 100)));
}

export function stageWorkIndex(task, stageWorkNodes) {
    const nodes = stageWorkNodes ?? [];
    if (nodes.length === 0) return 0;
    const nodeIndex = nodes.findIndex(node => node.key === task?.receiveNodeKey);
    if (nodeIndex >= 0) return nodeIndex;
    const percent = progressPercent(task);
    const rawIndex = Math.floor((percent / 100) * nodes.length);
    return Math.min(nodes.length - 1, Math.max(0, rawIndex));
}

export function stageNodeTasks(tasks, stage, nodeIndex, stageWorkNodes) {
    return tasks.filter(task => stageWorkIndex(task, stageWorkNodes) === nodeIndex);
}
