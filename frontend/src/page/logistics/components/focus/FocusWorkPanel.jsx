import { EVENT_STORE_RETENTION_LIMIT, clearEventStore } from '@/store/eventStore';
import { getWorkNodeDescription } from '@/domain/logistics/common/stages';
import { getFailureCandidatesForStage } from '@/domain/logistics/common/failures';
import { formatRelativeAge, latestEvent, getStageTitle } from '../../utils';

const EVENT_STORE_WARN_COUNT = Math.floor(EVENT_STORE_RETENTION_LIMIT * 0.7);

function DetailItem({ label, value, tone }) {
    return (
        <div className={`logistics-work-line${tone ? ` tone-${tone}` : ''}`}>
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}


function EventStorePill({ eventCount }) {
    const isFull = eventCount >= EVENT_STORE_RETENTION_LIMIT;
    if (isFull) {
        return (
            <button
                type="button"
                className="logistics-meta-pill logistics-retention-badge"
                onClick={clearEventStore}
            >
                ⚠ Event Store {eventCount}/{EVENT_STORE_RETENTION_LIMIT} 초기화
            </button>
        );
    }
    return (
        <span
            className="logistics-meta-pill"
            style={{ color: eventCount > EVENT_STORE_WARN_COUNT ? 'var(--dark-status-warn)' : 'var(--dark-text-secondary)' }}
        >
            Event Store {eventCount}/{EVENT_STORE_RETENTION_LIMIT}
        </span>
    );
}

function FocusWorkHeader({ title, nodeDescription, eventCount, latest }) {
    return (
        <div className="logistics-work-head">
            <div>
                {/* <span className="logistics-caption-label">Current Work</span> */}
                {nodeDescription ? (
                    <div className="logistics-work-title-row">
                        <strong>{title}</strong>
                        <span className="logistics-node-description">{nodeDescription}</span>
                    </div>
                ) : (
                    <strong>{title}</strong>
                )}
            </div>
            <div className="logistics-work-head-meta">
                <EventStorePill eventCount={eventCount} />
                {latest && (
                    <span className="logistics-meta-pill">
                        {formatRelativeAge(latest.timestamp)}
                    </span>
                )}
            </div>
        </div>
    );
}

function EmptyFocusWorkGrid() {
    return (
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
    );
}

function FocusActionCard({ isFailed, recoveryActions, branchCandidates, onWorkAction, onBranchInject }) {
    if (isFailed) {
        return (
            <div className="logistics-work-card logistics-work-action-card">
                <h3>처리 방법</h3>
                {recoveryActions.length > 0 ? (
                    <div className="logistics-work-actions">
                        {recoveryActions.map(action => (
                            <button
                                type="button"
                                key={action.id}
                                onClick={() => onWorkAction(action)}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <span className="logistics-work-muted">등록된 조치 항목이 없습니다.</span>
                )}
            </div>
        );
    }

    return (
        <div className="logistics-work-card logistics-work-action-card">
            <h3>오류주입</h3>
            {branchCandidates.length > 0 ? (
                <div className="logistics-work-actions">
                    {branchCandidates.map(failure => (
                        <button
                            type="button"
                            key={failure.code}
                            onClick={() => onBranchInject(failure.code)}
                        >
                            {failure.label}
                        </button>
                    ))}
                </div>
            ) : (
                <span className="logistics-work-muted">현재 작업에 등록된 예외 후보가 없습니다.</span>
            )}
        </div>
    );
}

function FocusWorkGrid({ task, history, onWorkAction, onBranchInject }) {
    const uniqueEventKeys = new Set(history.map(event => event.idempotencyKey)).size;
    const latest = latestEvent(history);
    const isFailed = task.status === 'failed';
    const actorText = task.actor === 'system' ? '자동' : task.actor;
    const executionText = task.zoneCode
        ? `Zone ${task.zoneCode}`
        : task.vehicleId
            ? task.vehicleId
            : '실행 정보 대기';
    const failureCode = task.failureCode ?? task.failureLabel ?? '에러 코드 대기';
    const failureReason = task.failureReason ?? task.failureLabel ?? '에러 상세가 아직 기록되지 않았습니다.';
    const recoveryActions = task.failureActions ?? [];
    const branchCandidates = isFailed ? [] : getFailureCandidatesForStage(task.currentStage, task.receiveNodeKey);

    return (
        <div className="logistics-work-grid">
            <div className="logistics-work-card">
                <h3>작업 대상</h3>
                <DetailItem label="화주" value={task.owner} />
                <DetailItem label="품목" value={`${task.itemCode} · ${task.quantity}ea`} />
            </div>
            <div className="logistics-work-card">
                <h3>현재 처리</h3>
                <DetailItem label="담당" value={`${task.currentStage.split('_')[0]} / ${actorText}`} />
                <DetailItem label="실행" value={executionText} />
            </div>
            <div className={`logistics-work-card${isFailed ? ' is-alert' : ''}`}>
                <h3>{isFailed ? '에러 상세' : '진행 근거'}</h3>
                {isFailed ? (
                    <>
                        <DetailItem label="코드" value={failureCode} tone="alert" />
                        <DetailItem label="원인" value={failureReason} />
                    </>
                ) : (
                    <>
                        <DetailItem label="신호" value={latest?.routingKey ?? 'event 대기'} />
                        <DetailItem label="이벤트" value={`고유 ${uniqueEventKeys}건`} />
                    </>
                )}
            </div>
            <FocusActionCard
                isFailed={isFailed}
                recoveryActions={recoveryActions}
                branchCandidates={branchCandidates}
                onWorkAction={onWorkAction}
                onBranchInject={onBranchInject}
            />
        </div>
    );
}

export function EmptyFocusWorkPanel({ eventCount, onInfoOpen }) {
    return (
        <section className="logistics-focus-shell">
            <div className="logistics-focus-main">
                <div className="logistics-visual-panel logistics-stage-learning-panel">
                    <FocusWorkHeader
                        title="작업 선택 대기"
                        eventCount={eventCount}
                        onInfoOpen={onInfoOpen}
                    />
                    <EmptyFocusWorkGrid />
                </div>
            </div>
        </section>
    );
}

export default function FocusWorkPanel({ task, history, eventCount, onInfoOpen, onWorkAction, onBranchInject }) {
    const stageTitle = getStageTitle(task);
    const nodeDescription = getWorkNodeDescription(task.currentStage, task.receiveNodeKey);
    const latest = latestEvent(history);

    return (
        <section className="logistics-focus-shell">
            <div className="logistics-focus-main">
                <div className={`logistics-visual-panel logistics-stage-learning-panel status-${task.status}`}>
                    <FocusWorkHeader
                        title={stageTitle}
                        nodeDescription={nodeDescription}
                        eventCount={eventCount}
                        latest={latest}
                        onInfoOpen={onInfoOpen}
                    />
                    <FocusWorkGrid
                        task={task}
                        history={history}
                        onWorkAction={onWorkAction}
                        onBranchInject={onBranchInject}
                    />
                </div>
            </div>
        </section>
    );
}
