import { useCallback, useEffect, useState } from 'react';
import { emitter } from '@/domain/logistics/common/emitter';
import { getAllTasks } from '@/store/taskStore';
import { getEventCount } from '@/store/eventStore';
import { getTickProgress } from '@/scheduler/tickLoop';

function withLiveProgress(task) {
  let progress = getTickProgress(task.taskId);

  if (task.status === 'completed') progress = 1;
  if (task.status === 'failed') progress = Math.max(progress, 0.95);
  if (task.status === 'paused') progress = Math.max(progress, 0.05);

  return {
    ...task,
    liveProgress: progress,
  };
}

export default function useLogisticsSnapshot() {
  const [snapshot, setSnapshot] = useState({
    tasks: [],
    eventCount: 0,
  });

  const refresh = useCallback(async () => {
    const [tasks, eventCount] = await Promise.all([
      getAllTasks(),
      getEventCount(),
    ]);

    setSnapshot({
      tasks: [...tasks]
        .map(withLiveProgress)
        .sort((left, right) => right.updatedAt - left.updatedAt),
      eventCount,
    });
  }, []);

  useEffect(() => {
    let alive = true;

    const safeRefresh = async () => {
      if (!alive) return;
      await refresh();
    };

    safeRefresh();

    emitter.on('logistics:task:created', safeRefresh);
    emitter.on('logistics:task:updated', safeRefresh);
    emitter.on('logistics:task:stage', safeRefresh);
    emitter.on('logistics:retention:cleared', safeRefresh);
    emitter.on('logistics:event', safeRefresh);
    const intervalId = window.setInterval(safeRefresh, 250);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      emitter.off('logistics:task:created', safeRefresh);
      emitter.off('logistics:task:updated', safeRefresh);
      emitter.off('logistics:task:stage', safeRefresh);
      emitter.off('logistics:retention:cleared', safeRefresh);
      emitter.off('logistics:event', safeRefresh);
    };
  }, [refresh]);

  return snapshot;
}
