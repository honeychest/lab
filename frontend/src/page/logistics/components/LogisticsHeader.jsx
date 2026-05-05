import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TaskListPopover from './TaskListPopover';
import useLogisticsHeaderSnapshot, {
    HEALTH_AXES,
    HEALTH_COLOR,
    HEALTH_DOT,
    HEALTH_LABELS,
} from '../hooks/useLogisticsHeaderSnapshot';

export default function LogisticsHeader({ autoMode, onAutoToggle, onSettingsOpen, onLogOpen, logOpening = false, onInfoOpen }) {
    const navigate = useNavigate();
    const {
        kpi,
        allTaskList,
        processingTaskList,
        failedTaskList,
        health,
        healthDetails,
        retentionFull,
        handleRetentionClear,
    } = useLogisticsHeaderSnapshot();
    const [activePopover, setActivePopover] = useState(null);
    const [healthTooltipSide, setHealthTooltipSide] = useState({});

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
        <>
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
                        <button
                            className={`logistics-outline-btn${logOpening ? ' is-pressed' : ''}`}
                            onClick={onLogOpen}
                            aria-busy={logOpening}
                        >
                            📊 전체 로그
                        </button>
                    </div>
                </div>

                <div className="logistics-kpi-strip">
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
