import { useCallback, useEffect, useState } from 'react';
import { dlog } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getAllTasks } from '@/store/taskStore';
import { getAllEvents, getEventCount, clearEventStore, EVENT_STORE_RETENTION_LIMIT } from '@/store/eventStore';
import { STAGE_DOMAIN } from '@/domain/logistics/common/stages';

export const HEALTH_AXES = ['OMS', 'WMS', 'TMS', 'stream'];
export const HEALTH_LABELS = {
    OMS: 'OMS',
    WMS: 'WMS',
    TMS: 'TMS',
    stream: 'STREAM',
};
export const HEALTH_DOT = { ok: '●', warn: '⚠', error: '❌' };
export const HEALTH_COLOR = {
    ok:    'var(--dark-status-ok)',
    warn:  'var(--dark-status-warn)',
    error: 'var(--dark-status-error)',
};

const STALE_WARN_MS = 15000;
const STALE_ERROR_MS = 35000;
const FAILURE_WARN_COUNT = 1;
const FAILURE_ERROR_COUNT = 3;
const INITIAL_HEALTH = { OMS: 'ok', WMS: 'ok', TMS: 'ok', stream: 'ok' };
const INITIAL_HEALTH_DETAILS = {
    OMS: '이벤트 대기 중',
    WMS: '이벤트 대기 중',
    TMS: '이벤트 대기 중',
    stream: 'self-ping 대기 중',
};

function lastAgeText(timestamp) {
    if (!timestamp) return '최근 이벤트 없음';
    const ageSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    return `${ageSec}초 전 이벤트`;
}

function formatFailureDetail(failureTask) {
    if (!failureTask) return '';

    const parts = [];
    if (failureTask.failureCode) parts.push(failureTask.failureCode);
    if (failureTask.failureLabel) parts.push(failureTask.failureLabel);
    if (failureTask.currentStage) parts.push(failureTask.currentStage);
    if (typeof failureTask.failureRecoverable === 'boolean') {
        parts.push(failureTask.failureRecoverable ? '복구 가능' : '수동 검토');
    }

    return parts.length > 0 ? ` · 최근 ${parts.join(' / ')}` : '';
}

function buildDomainHealth(axis, tasks, events) {
    if (axis === 'stream') {
        return {
            status: 'ok',
            detail: 'self-ping NoOp 유지 · 단계2에서 실측으로 교체',
        };
    }

    const activeTasks = tasks.filter(task => STAGE_DOMAIN[task.currentStage] === axis && task.status === 'active');
    const failedTasks = tasks.filter(task => STAGE_DOMAIN[task.currentStage] === axis && task.status === 'failed');
    const recentFailure = [...failedTasks].sort((left, right) => right.updatedAt - left.updatedAt)[0];
    const failureSuffix = formatFailureDetail(recentFailure);
    const domainEvents = events.filter(event => {
        if (axis === 'OMS') return event.eventType.startsWith('order.');
        if (axis === 'WMS') return event.eventType.startsWith('shipment.') || event.eventType.startsWith('inbound.');
        if (axis === 'TMS') return event.eventType.startsWith('dispatch.');
        return false;
    });
    const lastEvent = domainEvents[domainEvents.length - 1];
    const lastTimestamp = lastEvent?.timestamp ?? null;
    const staleMs = lastTimestamp ? Date.now() - lastTimestamp : Number.POSITIVE_INFINITY;

    if (failedTasks.length >= FAILURE_ERROR_COUNT || (activeTasks.length > 0 && staleMs >= STALE_ERROR_MS)) {
        return {
            status: 'error',
            detail: failedTasks.length >= FAILURE_ERROR_COUNT
                ? `실패 ${failedTasks.length}건 누적${failureSuffix}`
                : `활성 작업 ${activeTasks.length}건, ${lastAgeText(lastTimestamp)}${failureSuffix}`,
        };
    }

    if (failedTasks.length >= FAILURE_WARN_COUNT || (activeTasks.length > 0 && staleMs >= STALE_WARN_MS)) {
        return {
            status: 'warn',
            detail: failedTasks.length > 0
                ? `실패 ${failedTasks.length}건, ${lastAgeText(lastTimestamp)}${failureSuffix}`
                : `활성 작업 ${activeTasks.length}건, ${lastAgeText(lastTimestamp)}${failureSuffix}`,
        };
    }

    return {
        status: 'ok',
        detail: activeTasks.length > 0
            ? `활성 ${activeTasks.length}건, ${lastAgeText(lastTimestamp)}`
            : '대기 중 · 최근 실패 없음',
    };
}

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
        const failed = tasks.filter(task => task.status === 'failed');
        const processing = tasks.filter(task => task.status === 'active' || task.status === 'paused');
        const oms = buildDomainHealth('OMS', tasks, events);
        const wms = buildDomainHealth('WMS', tasks, events);
        const tms = buildDomainHealth('TMS', tasks, events);
        const stream = buildDomainHealth('stream', tasks, events);

        setKpi({
            orders: tasks.length,
            processing: processing.length,
            failed: failed.length,
            sla: 0,
        });
        setAllTaskList([...tasks].sort((left, right) => right.updatedAt - left.updatedAt));
        setProcessingTaskList([...processing].sort((left, right) => right.updatedAt - left.updatedAt));
        setFailedTaskList([...failed].sort((left, right) => right.updatedAt - left.updatedAt));
        setRetentionFull(count >= EVENT_STORE_RETENTION_LIMIT);
        setHealth({
            OMS: oms.status,
            WMS: wms.status,
            TMS: tms.status,
            stream: stream.status,
        });
        setHealthDetails({
            OMS: oms.detail,
            WMS: wms.detail,
            TMS: tms.detail,
            stream: stream.detail,
        });
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
