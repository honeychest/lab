import FocusRouteSummary from './tabs/FocusRouteSummary';

const TABS = [
    { id: 'overview', label: '▣ 3축 개요' },
    { id: 'oms',      label: 'OMS' },
    { id: 'wms',      label: 'WMS' },
    { id: 'tms',      label: 'TMS' },
    { id: 'list',     label: '📋 목록' },
];

export default function TabBar({
    activeTab,
    onTabChange,
    autoMode,
    onAutoToggle,
    onSettingsOpen,
    onLogOpen,
    logOpening = false,
    retentionFull = false,
    onRetentionClear,
}) {
    return (
        <nav className="logistics-tabbar">
            <div className="logistics-tab-list">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`logistics-tab-btn${activeTab === tab.id ? ' active' : ''}`}
                        onClick={() => onTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <FocusRouteSummary />
            <div className="logistics-tab-actions">
                <button className={autoMode ? 'logistics-primary-btn' : 'logistics-outline-btn'} onClick={onAutoToggle}>
                    {autoMode ? '⏸ 시뮬레이션 정지 (진행 중)' : '▶ 시뮬레이션 시작'}
                </button>
                <button className="logistics-secondary-btn" onClick={onSettingsOpen}>⚙ 설정</button>
                {retentionFull && (
                    <button className="logistics-meta-pill logistics-retention-badge" onClick={onRetentionClear}>
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
        </nav>
    );
}
