import { useState, useEffect } from 'react';
import { dlog } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getTaskById } from '@/store/taskStore';
import { EVENT_STORE_RETENTION_LIMIT, getEventCount, getEventsByAggregate } from '@/store/eventStore';
import { STAGE_GUIDANCE, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { performRecoveryAction } from '../services/recoveryActions';

const STATE_TEXT = {
    active: '정상 진행',
    paused: '운영자 일시정지',
    failed: '실패 대응 필요',
    completed: '타임라인 완료',
    cancelled: '운영자 취소',
};
const EVENT_STORE_WARN_COUNT = Math.floor(EVENT_STORE_RETENTION_LIMIT * 0.7);

function formatTimestamp(timestamp) {
    if (!timestamp) return '기록 없음';
    return new Date(timestamp).toLocaleString('ko-KR', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function latestEvent(history) {
    return history[history.length - 1] ?? null;
}

function formatRelativeAge(timestamp) {
    if (!timestamp) return '기록 없음';
    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    return formatTimestamp(timestamp);
}

function getStageTitle(task) {
    if (!task) return null;

    const base = STAGE_GUIDANCE[task.currentStage] ?? {
        title: STAGE_LABELS[task.currentStage] ?? task.currentStage,
    };

    return base.title;
}

function DetailItem({ label, value, tone }) {
    return (
        <div className={`logistics-work-line${tone ? ` tone-${tone}` : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

export default function FocusArea({ onInfoOpen }) {
    const [focusedTask, setFocusedTask] = useState(null);
    const [history, setHistory] = useState([]);
    const [eventCount, setEventCount] = useState(0);
    const focusedTaskId = focusedTask?.taskId ?? null;
    const focusedTaskStage = focusedTask?.currentStage ?? null;

    useEffect(() => {
        const refreshEventCount = async () => {
            setEventCount(await getEventCount());
        };
        void refreshEventCount();

        emitter.on('logistics:event', refreshEventCount);
        emitter.on('logistics:retention:cleared', refreshEventCount);
        return () => {
            emitter.off('logistics:event', refreshEventCount);
            emitter.off('logistics:retention:cleared', refreshEventCount);
        };
    }, []);

    useEffect(() => {
        const refresh = async (taskId) => {
            if (!taskId) {
                setFocusedTask(null);
                setHistory([]);
                return;
            }
            const [task, events] = await Promise.all([
                getTaskById(taskId),
                getEventsByAggregate(taskId),
            ]);
            setFocusedTask(task ?? null);
            setHistory(events);
        };

        const onFocusChanged = async ({ taskId }) => {
            await refresh(taskId);
        };
        const onTaskUpdated = async ({ taskId }) => {
            if (focusedTaskId === taskId) {
                await refresh(taskId);
            }
        };
        const onEventLogged = async (event) => {
            if (focusedTaskId && event.aggregateId === focusedTaskId) {
                await refresh(focusedTaskId);
            }
        };
        emitter.on('logistics:focus:changed', onFocusChanged);
        emitter.on('logistics:task:updated', onTaskUpdated);
        emitter.on('logistics:event', onEventLogged);
        return () => {
            emitter.off('logistics:focus:changed', onFocusChanged);
            emitter.off('logistics:task:updated', onTaskUpdated);
            emitter.off('logistics:event', onEventLogged);
        };
    }, [focusedTaskId]);

    useEffect(() => {
        if (!focusedTaskId) return;
        dlog(1, 'FocusArea redesign: Current Stage now uses selected task detail and exception handling panel.');
    }, [focusedTaskId, focusedTaskStage]);

    if (!focusedTask) {
        return (
            <section className="logistics-focus-shell">
                <div className="logistics-focus-main">
                    <div className="logistics-visual-panel logistics-stage-learning-panel">
                        <div className="logistics-work-head">
                            <div>
                                <span className="logistics-caption-label">Current Work</span>
                                <strong>작업 선택 대기</strong>
                            </div>
                            <div className="logistics-work-head-meta">
                                <button
                                    type="button"
                                    className="logistics-meta-pill logistics-health-btn"
                                    onClick={() => onInfoOpen?.({
                                        title: 'Routing key 규칙',
                                        summary: '이벤트 메시지 이름을 일관되게 만들기 위한 규칙입니다.',
                                        bullets: [
                                            '형식: {aggregate}.{verb}.{past-tense}',
                                            '예: order.received, shipment.dispatched',
                                            '전체 로그 필터와 흐름 추적에 사용',
                                        ],
                                    })}
                                >
                                    Routing key 규칙
                                </button>
                                <span className="logistics-meta-pill" style={{ color: eventCount > EVENT_STORE_WARN_COUNT ? 'var(--dark-status-warn)' : 'var(--dark-text-secondary)' }}>
                                    Event Store {eventCount}/{EVENT_STORE_RETENTION_LIMIT}
                                </span>
                            </div>
                        </div>
                        <div className="logistics-work-grid">
                            <div className="logistics-work-card">
                                <h3>작업 대상</h3>
                                <DetailItem label="Task" value="선택 없음" />
                                <DetailItem label="대상" value="레인 카드 선택 대기" />
                            </div>
                            <div className="logistics-work-card">
                                <h3>현재 처리</h3>
                                <DetailItem label="담당" value="대기" />
                                <DetailItem label="처리" value="대기" />
                            </div>
                            <div className="logistics-work-card">
                                <h3>진행 근거</h3>
                                <DetailItem label="최근 신호" value="event 대기" />
                                <DetailItem label="추적" value="대기" />
                            </div>
                            <div className="logistics-work-card logistics-work-action-card">
                                <h3>처리 방법</h3>
                                <span className="logistics-work-muted">작업 선택 후 필요한 액션을 표시합니다.</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    const uniqueEventKeys = new Set(history.map(event => event.idempotencyKey)).size;
    const stageTitle = getStageTitle(focusedTask);
    const latest = latestEvent(history);
    const isFailed = focusedTask.status === 'failed';
    const actorText = focusedTask.actor === 'system' ? '자동' : focusedTask.actor;
    const executionText = focusedTask.zoneCode
        ? `Zone ${focusedTask.zoneCode}`
        : focusedTask.vehicleId
            ? focusedTask.vehicleId
            : '실행 정보 대기';
    const recoveryText = typeof focusedTask.failureRecoverable === 'boolean'
        ? (focusedTask.failureRecoverable ? '복구 가능' : '수동 검토 필요')
        : '판단 대기';
    const failureCode = focusedTask.failureCode ?? focusedTask.failureLabel ?? '에러 코드 대기';
    const failureReason = focusedTask.failureReason ?? focusedTask.failureLabel ?? '에러 상세가 아직 기록되지 않았습니다.';
    const recoveryActions = focusedTask.failureActions ?? [];
    const handleWorkAction = async (action) => {
        dlog(1, 'FocusArea.workAction — RightPanel 조치와 동일 recovery action 실행', action.id, focusedTask.taskId);
        await performRecoveryAction(focusedTask, action);
        onInfoOpen?.({
            title: `${action.label} 처리`,
            summary: '상단 Current Work와 우측 조치 패널이 같은 recovery action을 실행했습니다.',
            bullets: [
                `Task: ${focusedTask.taskId}`,
                `조치: ${action.label}`,
                `최근 신호: ${latest?.routingKey ?? 'event 대기'}`,
            ],
        });
    };

    return (
        <section className="logistics-focus-shell">
            <div className="logistics-focus-main">
                <div className={`logistics-visual-panel logistics-stage-learning-panel status-${focusedTask.status}`}>
                    <div className="logistics-work-head">
                        <div>
                            <span className="logistics-caption-label">Current Work</span>
                            <strong>{stageTitle}</strong>
                        </div>
                        <div className="logistics-work-head-meta">
                            <button
                                type="button"
                                className="logistics-meta-pill logistics-health-btn"
                                onClick={() => onInfoOpen?.({
                                    title: 'Routing key 규칙',
                                    summary: '이벤트 메시지 이름을 일관되게 만들기 위한 규칙입니다.',
                                    bullets: [
                                        '형식: {aggregate}.{verb}.{past-tense}',
                                        '예: order.received, shipment.dispatched',
                                        '전체 로그 필터와 흐름 추적에 사용',
                                    ],
                                })}
                            >
                                Routing key 규칙
                            </button>
                            <span className="logistics-meta-pill" style={{ color: eventCount > EVENT_STORE_WARN_COUNT ? 'var(--dark-status-warn)' : 'var(--dark-text-secondary)' }}>
                                Event Store {eventCount}/{EVENT_STORE_RETENTION_LIMIT}
                            </span>
                        </div>
                    </div>

                    <div className="logistics-work-grid">
                        <div className="logistics-work-card">
                            <h3>작업 대상</h3>
                            <DetailItem label="화주" value={focusedTask.owner} />
                            <DetailItem label="품목" value={`${focusedTask.itemCode} · ${focusedTask.quantity}ea`} />
                            <DetailItem label="추적" value={focusedTask.correlationId.slice(0, 8)} />
                        </div>
                        <div className="logistics-work-card">
                            <h3>현재 처리</h3>
                            <DetailItem label="담당" value={`${focusedTask.currentStage.split('_')[0]} / ${actorText}`} />
                            <DetailItem label="실행" value={executionText} />
                            <DetailItem label="최근" value={formatRelativeAge(latest?.timestamp)} />
                        </div>
                        <div className={`logistics-work-card${isFailed ? ' is-alert' : ''}`}>
                            <h3>{isFailed ? '에러 상세' : '진행 근거'}</h3>
                            {isFailed ? (
                                <>
                                    <DetailItem label="코드" value={failureCode} tone="alert" />
                                    <DetailItem label="원인" value={failureReason} />
                                    <DetailItem label="복구" value={recoveryText} />
                                </>
                            ) : (
                                <>
                                    <DetailItem label="신호" value={latest?.routingKey ?? 'event 대기'} />
                                    <DetailItem label="이벤트" value={`고유 ${uniqueEventKeys}건`} />
                                    <DetailItem label="상태" value="조치 불필요" />
                                </>
                            )}
                        </div>
                        <div className="logistics-work-card logistics-work-action-card">
                            <h3>처리 방법</h3>
                            {isFailed ? (
                                recoveryActions.length > 0 ? (
                                    <div className="logistics-work-actions">
                                        {recoveryActions.map(action => (
                                            <button
                                                type="button"
                                                key={action.id}
                                                onClick={() => handleWorkAction(action)}
                                            >
                                                {action.label}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="logistics-work-muted">등록된 조치 항목이 없습니다.</span>
                                )
                            ) : (
                                <>
                                    <DetailItem label="추천" value="관찰 유지" />
                                    <DetailItem label="액션" value="현재 조치 없음" />
                                    <DetailItem label="최근 신호" value={latest?.routingKey ?? 'event 대기'} />
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
