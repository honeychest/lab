import { useCallback, useEffect, useState } from 'react';
import { dlog, dtag } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getAllTasks } from '@/store/taskStore';
import { getAllEvents, getEventCount, clearEventStore } from '@/store/eventStore';
import { buildHeaderSnapshot, INITIAL_HEALTH, INITIAL_HEALTH_DETAILS } from './headerSnapshot';
export { HEALTH_AXES, HEALTH_LABELS, HEALTH_DOT, HEALTH_COLOR } from './headerSnapshot';

export default function useLogisticsHeaderSnapshot() {
    const [kpi, setKpi] = useState({ orders: 0, processing: 0, failed: 0, sla: 0 });
    const [allTaskList, setAllTaskList] = useState([]);
    const [processingTaskList, setProcessingTaskList] = useState([]);
    const [failedTaskList, setFailedTaskList] = useState([]);
    const [health, setHealth] = useState(INITIAL_HEALTH);
    const [healthDetails, setHealthDetails] = useState(INITIAL_HEALTH_DETAILS);
    const [retentionFull, setRetentionFull] = useState(false);

    const refreshKpi = useCallback(async () => {
        const tasks = await getAllTasks();
        const events = await getAllEvents();
        const count = await getEventCount();
        const snapshot = buildHeaderSnapshot(tasks, events, count);

        setKpi(snapshot.kpi);
        setAllTaskList(snapshot.allTaskList);
        setProcessingTaskList(snapshot.processingTaskList);
        setFailedTaskList(snapshot.failedTaskList);
        setRetentionFull(snapshot.retentionFull);
        setHealth(snapshot.health);
        setHealthDetails(snapshot.healthDetails);
    }, []);

    useEffect(() => {
        let alive = true;

        const safeRefreshKpi = async () => {
            if (!alive) return;
            await refreshKpi();
        };
        const onRetentionFull = () => {
            setRetentionFull(true);
            void safeRefreshKpi();
        };
        const onRetentionCleared = () => {
            setRetentionFull(false);
            void safeRefreshKpi();
        };

        emitter.on('logistics:kpi:updated', safeRefreshKpi);
        emitter.on('logistics:event', safeRefreshKpi);
        emitter.on('logistics:retention:full', onRetentionFull);
        emitter.on('logistics:retention:cleared', onRetentionCleared);
        const healthTimer = window.setInterval(safeRefreshKpi, 5000);

        void safeRefreshKpi();

        return () => {
            alive = false;
            window.clearInterval(healthTimer);
            emitter.off('logistics:kpi:updated', safeRefreshKpi);
            emitter.off('logistics:event', safeRefreshKpi);
            emitter.off('logistics:retention:full', onRetentionFull);
            emitter.off('logistics:retention:cleared', onRetentionCleared);
        };
    }, [refreshKpi]);

    const handleRetentionClear = async () => {
        dtag(2, ['logistics', 'retention', 'reset'], '운영자 retention 만료 시 이벤트 저장소 초기화 블록');
        await clearEventStore();
        setRetentionFull(false);
        dlog(1, 'LogisticsHeader.retentionClear — 운영자 IndexedDB 클리어');
    };

    return {
        kpi,
        allTaskList,
        processingTaskList,
        failedTaskList,
        health,
        healthDetails,
        retentionFull,
        handleRetentionClear,
    };
}
