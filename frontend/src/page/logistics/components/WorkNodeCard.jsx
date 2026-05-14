export default function WorkNodeCard({
    node,
    index,
    nodeTasks,
    stage,
    onPopover,
    stacked = true,
    className = '',
    focused = false,
    focusedFailed = false,
}) {
    const counts = {
        active: nodeTasks.filter(t => t.status === 'active').length,
        failed: nodeTasks.filter(t => t.status === 'failed').length,
    };
    const nodeClass = [
        'logistics-work-node',
        stacked ? 'logistics-work-node--stacked' : '',
        nodeTasks.length > 0 ? 'active' : '',
        counts.active > 0 ? 'has-active' : '',
        counts.failed > 0 ? 'has-failure' : '',
        focused ? 'is-focused' : '',
        focusedFailed ? 'is-focused-failed' : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={nodeClass}>
            <div className="logistics-work-node-rail" aria-hidden="true">
                <span>{String(index + 1).padStart(2, '0')}</span>
            </div>
            <div className="logistics-work-node-body">
                <div className="logistics-work-node-top">
                    <div className="logistics-work-node-title" title={node.description ?? node.label}>{node.label}</div>
                    <div className="logistics-work-node-top-meta">
                        <button
                            type="button"
                            className={`logistics-work-node-count ${nodeTasks.length === 0 ? 'is-empty' : ''}`}
                            disabled={nodeTasks.length === 0}
                            onClick={(event) => onPopover(event, stage, node, 'all', nodeTasks)}
                        >
                            {nodeTasks.length > 0 ? nodeTasks.length : ''}
                        </button>
                        <div className="logistics-work-node-status-row">
                            {[
                                ['active', '진행중', counts.active],
                                ['failed', '실패', counts.failed],
                            ].map(([status, label, count]) => (
                                <button
                                    key={status}
                                    type="button"
                                    className={`logistics-work-node-status ${status} ${count === 0 ? 'is-empty' : ''}`}
                                    disabled={count === 0}
                                    onClick={(event) => onPopover(event, stage, node, status, nodeTasks)}
                                >
                                    {status === 'active' ? (
                                        <span className={count > 0 ? 'sample_live_spinner' : 'logistics-status-idle-ring'} aria-hidden="true" />
                                    ) : (
                                        <span className="logistics-health-dot" aria-hidden="true">❌</span>
                                    )}
                                    <span>{label}</span>
                                    <strong>{count}</strong>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
