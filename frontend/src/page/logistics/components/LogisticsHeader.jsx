import { useState } from 'react';
import TaskListPopover from './TaskListPopover';

export default function LogisticsHeader({ snapshot, activeTab, onTabChange }) {
    const { kpi, allTaskList, processingTaskList, failedTaskList } = snapshot;
    const [activePopover, setActivePopover] = useState(null);

    const failureTone = kpi.failed > 0 ? 'var(--dark-status-error)' : 'var(--dark-text-primary)';
    const orderClickable = kpi.orders > 0;
    const processingClickable = kpi.processing > 0;
    const failedClickable = kpi.failed > 0;

    return (
        <>
            <header className="logistics-header">
                <div className="logistics-header-intro">
                    <div className="logistics-header-title-row">
                        <h1 className="logistics-header-title">물류 프로세스 관제</h1>
                        <div className="logistics-header-subtitle">(업무분석용/백엔드미구현)</div>
                    </div>
                    <div className="logistics-header-tab-nav">
                        <button
                            type="button"
                            className={`logistics-tab-btn${activeTab === 'overview' ? ' active' : ''}`}
                            onClick={() => onTabChange?.('overview')}
                        >
                            Overview
                        </button>
                        <button
                            type="button"
                            className={`logistics-tab-btn${activeTab === 'list' ? ' active' : ''}`}
                            onClick={() => onTabChange?.('list')}
                        >
                            전체 작업
                        </button>
                    </div>
                </div>

                <div
                    className="logistics-header-right"
                    style={{ gridArea: 'kpis', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-end' }}
                >
                    <div className="logistics-kpi-strip logistics-kpi-strip-compact" style={{ gridArea: 'auto' }}>
                        <button
                            type="button"
                            className={`logistics-kpi-card logistics-kpi-card-button${orderClickable ? ' is-clickable' : ''}`}
                            onClick={() => orderClickable && setActivePopover('orders')}
                        >
                            <div className="logistics-kpi-label">오더</div>
                            <div className="logistics-kpi-value">{kpi.orders}</div>
                        </button>
                        <button
                            type="button"
                            className={`logistics-kpi-card logistics-kpi-card-button${processingClickable ? ' is-clickable' : ''}`}
                            onClick={() => processingClickable && setActivePopover('processing')}
                        >
                            <div className="logistics-kpi-label">처리중</div>
                            <div className="logistics-kpi-value">{kpi.processing}</div>
                        </button>
                        <button
                            type="button"
                            className={`logistics-kpi-card logistics-kpi-card-button${failedClickable ? ' is-clickable' : ''}`}
                            onClick={() => failedClickable && setActivePopover('failed')}
                        >
                            <div className="logistics-kpi-label">실패</div>
                            <div className="logistics-kpi-value" style={{ color: failureTone }}>{kpi.failed}</div>
                        </button>
                    </div>
                </div>
            </header>

            {activePopover === 'orders' && (
                <TaskListPopover
                    title="전체 오더"
                    tasks={allTaskList}
                    emptyMessage="오더 없음"
                    onClose={() => setActivePopover(null)}
                />
            )}
            {activePopover === 'processing' && (
                <TaskListPopover
                    title="처리중 작업"
                    tasks={processingTaskList}
                    emptyMessage="처리중 작업 없음"
                    variant="processing"
                    onClose={() => setActivePopover(null)}
                />
            )}
            {activePopover === 'failed' && (
                <TaskListPopover
                    title="실패 작업 목록"
                    tasks={failedTaskList}
                    emptyMessage="실패 작업 없음"
                    variant="failed"
                    onClose={() => setActivePopover(null)}
                />
            )}
        </>
    );
}
