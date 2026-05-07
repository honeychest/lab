import { STAGE_DOMAIN, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';

function statusLabel(status) {
    if (status === 'active') return '진행중';
    if (status === 'paused') return '일시정지';
    if (status === 'completed') return '완료';
    if (status === 'failed') return '실패';
    return status;
}

function defaultTaskMeta(task, variant) {
    if (variant === 'processing') {
        return `${STAGE_DOMAIN[task.currentStage]} · ${STAGE_LABELS[task.currentStage]}`;
    }

    if (variant === 'failed') {
        return `${STAGE_DOMAIN[task.currentStage]} · ${task.failureLabel || STAGE_LABELS[task.currentStage]}`;
    }

    return `${statusLabel(task.status)} · ${STAGE_LABELS[task.currentStage]}`;
}

export default function TaskListPopover({
    title,
    tasks,
    emptyMessage,
    variant = 'default',
    onClose,
    onTaskSelect,
}) {
    return (
        <div className="logistics-node-popover-backdrop" style={{ zIndex: 120 }} onClick={onClose}>
            <div className="logistics-node-popover" onClick={event => event.stopPropagation()}>
                <div className="logistics-node-popover-top">
                    <div>
                        <div className="logistics-side-title">{title}</div>
                        <div className="logistics-node-popover-title">{tasks.length}건 · 최신순</div>
                    </div>
                    <button type="button" className="logistics-outline-btn" onClick={onClose}>닫기</button>
                </div>
                <div className="logistics-node-popover-list">
                    {tasks.length === 0 ? (
                        <div className="logistics-empty-card">{emptyMessage}</div>
                    ) : tasks.map(task => (
                        <button
                            key={task.taskId}
                            type="button"
                            className="logistics-node-popover-row"
                            onClick={() => {
                                setFocus(task.taskId);
                                onTaskSelect?.(task);
                                onClose();
                            }}
                        >
                            <span className={variant === 'failed' ? 'logistics-preview-id' : undefined}>{task.taskId}</span>
                            <strong>{task.owner} · {task.itemCode}</strong>
                            <em>{defaultTaskMeta(task, variant)}</em>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
