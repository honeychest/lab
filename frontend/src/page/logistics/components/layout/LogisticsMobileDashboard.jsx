import { useState } from 'react';
import Header from '@/shared/ui/layout/Header.jsx';
import TaskListPopover from '../TaskListPopover';
import MobileTaskDetail from './MobileTaskDetail';

export default function LogisticsMobileDashboard({
    headerSnapshot,
    autoMode,
    onAutoToggle,
    onSettingsOpen,
    onLogOpen,
    logOpen,
    logScope,
    selectedTask,
    latestSelectedEvent,
    onTaskSelect,
    onRecoveryAction,
    onBranchInject,
    onDesktopViewOpen,
}) {
    const { kpi, allTaskList, processingTaskList, failedTaskList, retentionFull, handleRetentionClear } = headerSnapshot;
    const [activePopover, setActivePopover] = useState(null);
    const kpiItems = [
        {
            key: 'orders',
            label: '오더',
            value: kpi.orders,
            tasks: allTaskList,
            title: '전체 오더',
            emptyMessage: '오더 없음',
        },
        {
            key: 'processing',
            label: '진행중',
            value: kpi.processing,
            tasks: processingTaskList,
            title: '처리중 작업',
            emptyMessage: '처리중 작업 없음',
            variant: 'processing',
        },
        {
            key: 'failed',
            label: '실패',
            value: kpi.failed,
            tasks: failedTaskList,
            title: '실패 작업 목록',
            emptyMessage: '실패 작업 없음',
            variant: 'failed',
        },
    ];
    const popover = kpiItems.find(item => item.key === activePopover);

    return (
        <div className="theme-harbor logistics-mobile-shell">
            <Header />
            <main className="logistics-mobile-main">
                <section className="logistics-mobile-summary" aria-label="물류 요약">
                    {kpiItems.map(item => (
                        <button
                            key={item.key}
                            type="button"
                            className={`logistics-mobile-kpi ${item.key === 'failed' && item.value > 0 ? 'is-danger' : ''}`}
                            onClick={() => setActivePopover(item.key)}
                        >
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                        </button>
                    ))}
                </section>

                <section className="logistics-mobile-tab-actions" aria-label="물류 작업">
                    <button
                        className={`logistics-run-btn${autoMode ? ' is-running' : ''}`}
                        onClick={onAutoToggle}
                    >
                        {autoMode ? '■ 자동주문 정지' : '▶ 시뮬레이션 시작'}
                    </button>
                    <button className="logistics-secondary-btn" onClick={onSettingsOpen}>⚙ 설정</button>
                    {retentionFull && (
                        <button className="logistics-meta-pill logistics-retention-badge" onClick={handleRetentionClear}>
                            ⚠ Event Store 가득 참 — 초기화
                        </button>
                    )}
                    <button
                        className={`logistics-outline-btn${logOpen && logScope === 'all' ? ' is-pressed' : ''}`}
                        onClick={onLogOpen}
                        aria-busy={logOpen && logScope === 'all'}
                    >
                        📊 전체 로그
                    </button>
                    <button className="logistics-outline-btn" onClick={onDesktopViewOpen}>
                        PC화면으로 보기
                    </button>
                </section>
                <MobileTaskDetail
                    task={selectedTask}
                    latestEvent={latestSelectedEvent}
                    onRecoveryAction={onRecoveryAction}
                    onBranchInject={onBranchInject}
                />
            </main>

            {popover && (
                <TaskListPopover
                    title={popover.title}
                    tasks={popover.tasks}
                    emptyMessage={popover.emptyMessage}
                    variant={popover.variant}
                    onTaskSelect={onTaskSelect}
                    onClose={() => setActivePopover(null)}
                />
            )}
        </div>
    );
}
