import FocusRouteSummary from './tabs/FocusRouteSummary';

const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'eos',      label: 'EOS', group: 'entry', groupLabel: '진입' },
    { id: 'oms',      label: 'OMS', group: 'entry' },
    { id: 'wms',      label: 'WMS', group: 'process', groupLabel: '처리' },
    { id: 'qms',      label: 'QMS', group: 'process' },
    { id: 'tms',      label: 'TMS', group: 'process' },
    { id: 'list',     label: '📋 목록' },
];

function buildTabSegments(tabs) {
    const segments = [];
    let i = 0;
    while (i < tabs.length) {
        const tab = tabs[i];
        if (tab.group) {
            const segment = { type: 'group', key: `g-${tab.group}`, label: tab.groupLabel, items: [] };
            while (i < tabs.length && tabs[i].group === tab.group) {
                segment.items.push(tabs[i]);
                i++;
            }
            segments.push(segment);
        } else {
            segments.push({ type: 'tab', key: tab.id, item: tab });
            i++;
        }
    }
    return segments;
}

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
    const segments = buildTabSegments(TABS);
    const renderButton = (tab) => (
        <button
            key={tab.id}
            className={`logistics-tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => onTabChange(tab.id)}
        >
            {tab.label}
        </button>
    );

    return (
        <nav className="logistics-tabbar">
            <div className="logistics-tab-list">
                {segments.flatMap((segment, idx) => {
                    const node = segment.type === 'group'
                        ? (
                            <span key={segment.key} className="logistics-tab-group-row">
                                {segment.items.map(renderButton)}
                            </span>
                        )
                        : renderButton(segment.item);
                    return idx === 0
                        ? [node]
                        : [<span key={`d-${segment.key}`} className="logistics-tab-divider" aria-hidden="true" />, node];
                })}
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
