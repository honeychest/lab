import { STAGE_LABELS } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';
import { nodeStatusLabel } from '../utils';

export default function NodeTaskPopover({
    taskPopover,
    focusedTaskId,
    onClose,
    renderPrimary = task => task.owner,
    renderMeta = task => `${task.itemCode} · ${task.quantity}ea`,
}) {
    return (
        <div className="logistics-node-popover-backdrop" onClick={onClose}>
            <div className="logistics-node-popover" onClick={(event) => event.stopPropagation()}>
                <div className="logistics-node-popover-top">
                    <div>
                        <div className="logistics-side-title">{STAGE_LABELS[taskPopover.stage]} · {taskPopover.nodeLabel}</div>
                        <div className="logistics-node-popover-title">{nodeStatusLabel(taskPopover.status)} {taskPopover.tasks.length}건</div>
                    </div>
                    <button type="button" className="logistics-outline-btn" onClick={onClose}>닫기</button>
                </div>
                <div className="logistics-node-popover-list">
                    {taskPopover.tasks.map(task => (
                        <button
                            key={task.taskId}
                            type="button"
                            className={`logistics-node-popover-row${focusedTaskId === task.taskId ? ' focused' : ''}`}
                            onClick={() => {
                                setFocus(task.taskId);
                                onClose();
                            }}
                        >
                            <span>{task.taskId}</span>
                            <strong>{renderPrimary(task)}</strong>
                            <em>{renderMeta(task)}</em>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
