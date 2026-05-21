import { getOmsReceiveNodeLabel, STAGE_GUIDANCE, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { CHAIN_BG, CHAIN_ICON } from '../../constants';
import {
    historyEventLabel,
    isFailureEvent,
    historyRowType,
} from '../../utils';

function TaskDetailSection({ task, history, isPaused, onPause, onCancel, onLogOpen }) {
    const latestFailureEvent = history.find(isFailureEvent);
    const currentStageGuidance = STAGE_GUIDANCE[task.currentStage] ?? null;
    const receiveNodeLabel = task.currentStage === 'OMS_RECEIVED'
        ? getOmsReceiveNodeLabel(task.receiveNodeKey)
        : null;

    return (
        <div className="logistics-side-section">
            <div className="logistics-side-title">상세</div>
            <div className="logistics-focus-id">{task.taskId}</div>
            <div className="logistics-task-meta">
                {task.owner} · {task.itemCode} · ▶ {task.destination}
            </div>
            {(task.zoneCode || task.vehicleId || task.boxId) && (
                <div className="logistics-task-meta">
                    {task.zoneCode ? `Zone ${task.zoneCode}` : ''}
                    {task.zoneCode && task.zoneTemperature ? ` · ${task.zoneTemperature}` : ''}
                    {task.vehicleId ? ` · ${task.vehicleId}` : ''}
                    {task.boxId ? ` · ${task.boxId}` : ''}
                </div>
            )}
            <div className="logistics-task-meta">
                현재: {STAGE_LABELS[task.currentStage] ?? task.currentStage}
                {receiveNodeLabel && ` · ${receiveNodeLabel}`}
                {task.status === 'failed' && ` ❌ ${task.failureLabel ?? task.failureReason ?? ''}`}
                {isPaused && ' ⏸'}
            </div>
            {currentStageGuidance && (
                <div className="logistics-task-meta logistics-task-stage-summary">
                    {currentStageGuidance.summary}
                </div>
            )}
            {task.status === 'failed' && (
                <div className="logistics-task-meta">
                    {task.failureReason}
                </div>
            )}
            {task.status !== 'failed' && latestFailureEvent && (
                <div className="logistics-task-meta">
                    최근 실패: {historyEventLabel(latestFailureEvent)}
                </div>
            )}
            <div className="logistics-button-row">
                {task.status !== 'failed' && (
                    <button className="logistics-secondary-btn" onClick={onPause}>
                        {isPaused ? '▶ 재개' : '⏸ 일시정지'}
                    </button>
                )}
                <button className="logistics-danger-btn" onClick={onCancel}>✕ 취소</button>
                <button className="logistics-outline-btn" onClick={onLogOpen}>🔍 로그 보기</button>
            </div>
        </div>
    );
}

function HistoryChainSection({ task, history }) {
    return (
        <div className="logistics-side-section grow">
            <div className="logistics-side-title">이력 체인</div>
            {history.length === 0 && <p className="logistics-task-meta">이력 없음</p>}
            <div className="logistics-chain-list">
                {history.map((ev, i) => {
                    const type = historyRowType(ev, i, task.status);
                    return (
                        <div key={ev.eventId} className="logistics-chain-row" style={{ background: CHAIN_BG[type] ?? CHAIN_BG.pending }}>
                            <span>{CHAIN_ICON[type]}</span>
                            <span style={{ color: 'var(--dark-text-neutral)' }}>
                                {new Date(ev.timestamp).toLocaleTimeString('ko-KR', { hour12: false })}
                            </span>
                            <span>{historyEventLabel(ev)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function RightPanelContent({
    task,
    history,
    onPause,
    onCancel,
    onLogOpen,
}) {
    if (!task) {
        return <div className="logistics-panel-empty">📭 포커스 작업 없음</div>;
    }

    const isPaused = task.status === 'paused';

    return (
        <>
            <TaskDetailSection
                task={task}
                history={history}
                isPaused={isPaused}
                onPause={onPause}
                onCancel={onCancel}
                onLogOpen={onLogOpen}
            />
            <HistoryChainSection
                task={task}
                history={history}
            />
        </>
    );
}
