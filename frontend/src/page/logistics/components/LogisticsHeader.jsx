import { useState } from 'react';
import Header from '@/shared/ui/layout/Header.jsx';
import TaskListPopover from './TaskListPopover';

export default function LogisticsHeader({ snapshot }) {
    const { kpi, allTaskList, processingTaskList, failedTaskList } = snapshot;
    const [activePopover, setActivePopover] = useState(null);

    const failureTone = kpi.failed > 0 ? 'var(--dark-status-error)' : 'var(--dark-text-primary)';

    return (
        <>
            <Header />
            <header className="logistics-header">
                <div className="logistics-kpi-strip">
                    <div className="logistics-kpi-card" style={{ border: 'none', background: 'transparent' }}>
                        <div className="logistics-kpi-value">물류 프로세스 관제 (업무분석)</div>
                    </div>
                    <button
                        type="button"
                        className="logistics-kpi-card"
                        style={{ cursor: kpi.orders > 0 ? 'pointer' : 'default', textAlign: 'left', width: '100%' }}
                        onClick={() => kpi.orders > 0 && setActivePopover('orders')}
                    >
                        <div className="logistics-kpi-label">오더</div>
                        <div className="logistics-kpi-value">{kpi.orders}</div>
                    </button>
                    <button
                        type="button"
                        className="logistics-kpi-card"
                        style={{ cursor: kpi.processing > 0 ? 'pointer' : 'default', textAlign: 'left', width: '100%' }}
                        onClick={() => kpi.processing > 0 && setActivePopover('processing')}
                    >
                        <div className="logistics-kpi-label">처리중</div>
                        <div className="logistics-kpi-value">{kpi.processing}</div>
                    </button>
                    <button
                        type="button"
                        className="logistics-kpi-card"
                        style={{ cursor: kpi.failed > 0 ? 'pointer' : 'default', textAlign: 'left', width: '100%' }}
                        onClick={() => kpi.failed > 0 && setActivePopover('failed')}
                    >
                        <div className="logistics-kpi-label">실패</div>
                        <div className="logistics-kpi-value" style={{ color: failureTone }}>{kpi.failed}</div>
                    </button>
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
