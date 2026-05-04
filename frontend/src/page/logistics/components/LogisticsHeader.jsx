import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { dlog } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getAllTasks } from '@/store/taskStore';
import { getAllEvents, getEventCount, clearEventStore, EVENT_STORE_RETENTION_LIMIT } from '@/store/eventStore';
import { STAGE_DOMAIN } from '@/domain/logistics/common/stages';

const HEALTH_AXES = ['OMS', 'WMS', 'TMS', 'stream'];
const HEALTH_LABELS = {
    OMS: 'OMS',
    WMS: 'WMS',
    TMS: 'TMS',
    stream: 'STREAM',
};
const STALE_WARN_MS = 15000;
const STALE_ERROR_MS = 35000;
const FAILURE_WARN_COUNT = 1;
const FAILURE_ERROR_COUNT = 3;

// 흐름 9: 헬스 인디케이터 4축 — 단계1부터 항상 활성 (T3-ARCH 결정-15)
// 단계1 = self-ping NoOp → 모두 ● 표시. 단계2 컨슈머 활성 시 실측으로 교체
const INITIAL_HEALTH = { OMS: 'ok', WMS: 'ok', TMS: 'ok', stream: 'ok' };
const HEALTH_DOT = { ok: '●', warn: '⚠', error: '❌' };
const HEALTH_COLOR = {
    ok:    'var(--dark-status-ok)',
    warn:  'var(--dark-status-warn)',
    error: 'var(--dark-status-error)',
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
    const recentFailure = failedTasks.sort((left, right) => right.updatedAt - left.updatedAt)[0];
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

export default function LogisticsHeader({ autoMode, onAutoToggle, onSettingsOpen, onLogOpen, onInfoOpen }) {
    const navigate = useNavigate();
    const [kpi, setKpi] = useState({ orders: 0, processing: 0, failed: 0, sla: 0 });
    const [health, setHealth] = useState(INITIAL_HEALTH);
    const [healthTooltipSide, setHealthTooltipSide] = useState({});
    const [healthDetails, setHealthDetails] = useState({
        OMS: '이벤트 대기 중',
        WMS: '이벤트 대기 중',
        TMS: '이벤트 대기 중',
        stream: 'self-ping 대기 중',
    });
    const [retentionFull, setRetentionFull] = useState(false);

    const refreshKpi = useCallback(async () => {
        const tasks = await getAllTasks();
        const events = await getAllEvents();
        const cnt = await getEventCount();
        setKpi({
            orders:     tasks.length,
            processing: tasks.filter(t => t.status === 'active' || t.status === 'paused').length,
            failed:     tasks.filter(t => t.status === 'failed').length,
            sla:        0, // chs.dlog(3, 'KPI SLA 위반 집계 — 단계3 MySQL')
        });
        setRetentionFull(cnt >= EVENT_STORE_RETENTION_LIMIT);
        const oms = buildDomainHealth('OMS', tasks, events);
        const wms = buildDomainHealth('WMS', tasks, events);
        const tms = buildDomainHealth('TMS', tasks, events);
        const stream = buildDomainHealth('stream', tasks, events);
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

        const onRetentionFull = () => {
            setRetentionFull(true);
            refreshKpi();
        };
        const onRetentionCleared = () => {
            setRetentionFull(false);
            refreshKpi();
        };

        emitter.on('logistics:kpi:updated', refreshKpi);
        emitter.on('logistics:event', refreshKpi);
        emitter.on('logistics:retention:full', onRetentionFull);
        emitter.on('logistics:retention:cleared', onRetentionCleared);
        const healthTimer = window.setInterval(() => refreshKpi(), 5000);

        // 초기 데이터 로드 — async IIFE로 setState 직접 호출 회피
        (async () => {
            if (!alive) return;
            await refreshKpi();
        })();

        return () => {
            alive = false;
            window.clearInterval(healthTimer);
            emitter.off('logistics:kpi:updated', refreshKpi);
            emitter.off('logistics:event', refreshKpi);
            emitter.off('logistics:retention:full', onRetentionFull);
            emitter.off('logistics:retention:cleared', onRetentionCleared);
        };
    }, [refreshKpi]);

    const handleRetentionClear = async () => {
        await clearEventStore();
        setRetentionFull(false);
        dlog(1, 'LogisticsHeader.retentionClear — 운영자 IndexedDB 클리어');
    };

    const updateTooltipSide = (axis, element) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const side = centerX < window.innerWidth / 2 ? 'right' : 'left';
        setHealthTooltipSide(current => (
            current[axis] === side ? current : { ...current, [axis]: side }
        ));
    };

    const slaTone = kpi.sla > 0 ? 'var(--dark-status-warn)' : 'var(--dark-text-primary)';
    const failureTone = kpi.failed > 0 ? 'var(--dark-status-error)' : 'var(--dark-text-primary)';

    return (
        <header className="logistics-header">
            <div className="logistics-header-top">
                <div className="logistics-title-wrap">
                    <button className="logistics-home-btn" onClick={() => navigate('/binance')}>🏠</button>
                    <div className="logistics-title-block">
                        <h1 className="logistics-title">물류 프로세스 관제 (업무분석)</h1>
                    </div>
                </div>

                <div className="logistics-header-center">
                    <div className="logistics-health-row">
                        {HEALTH_AXES.map(axis => (
                            <span
                                key={axis}
                                className={`logistics-health-pill logistics-health-help tooltip-${healthTooltipSide[axis] ?? 'right'}`}
                                tabIndex={0}
                                onMouseEnter={(event) => updateTooltipSide(axis, event.currentTarget)}
                                onFocus={(event) => updateTooltipSide(axis, event.currentTarget)}
                            >
                                <span className="logistics-health-dot" style={{ color: HEALTH_COLOR[health[axis]] }}>
                                    {HEALTH_DOT[health[axis]]}
                                </span>
                                <span>{HEALTH_LABELS[axis]}</span>
                                <span className="logistics-health-tooltip">
                                    {healthDetails[axis]}
                                </span>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="logistics-header-actions">
                    <button className={autoMode ? 'logistics-primary-btn' : 'logistics-outline-btn'} onClick={onAutoToggle}>
                        {autoMode ? '⏸ Auto 정지 (진행 중)' : '▶ Auto 시작'}
                    </button>
                    <button className="logistics-secondary-btn" onClick={onSettingsOpen}>⚙ 설정</button>
                    {retentionFull && (
                        <button className="logistics-meta-pill logistics-retention-badge" onClick={handleRetentionClear}>
                            ⚠ Event Store 가득 참 — 초기화
                        </button>
                    )}
                    <button className="logistics-outline-btn" onClick={onLogOpen}>📊 전체 로그</button>
                </div>
            </div>

            <div className="logistics-kpi-strip">
                <div className="logistics-kpi-card">
                    <div className="logistics-kpi-label">오더</div>
                    <div className="logistics-kpi-value">{kpi.orders}</div>
                </div>
                <div className="logistics-kpi-card">
                    <div className="logistics-kpi-label">처리중</div>
                    <div className="logistics-kpi-value">{kpi.processing}</div>
                </div>
                <div className="logistics-kpi-card">
                    <div className="logistics-kpi-label">실패</div>
                    <div className="logistics-kpi-value" style={{ color: failureTone }}>{kpi.failed}</div>
                </div>
                <div className="logistics-kpi-card">
                    <div className="logistics-kpi-label">SLA 위반</div>
                    <button
                        type="button"
                        className="logistics-kpi-action"
                        onClick={() => onInfoOpen?.({
                            title: 'SLA 위반',
                            summary: '처리 허용 시간을 넘긴 작업 수입니다. 현재 화면에서는 집계 슬롯만 유지합니다.',
                            bullets: [
                                `현재 값: ${kpi.sla}건`,
                                '실시간 task 흐름 집계는 아직 미연결',
                                '헤더 슬롯과 운영자 확인 동선만 먼저 유지',
                            ],
                        })}
                    >
                        <div className="logistics-kpi-value" style={{ color: slaTone }}>{kpi.sla}</div>
                    </button>
                </div>
            </div>
        </header>
    );
}
