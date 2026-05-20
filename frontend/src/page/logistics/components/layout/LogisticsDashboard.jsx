import LogisticsHeader from '../LogisticsHeader';
import FocusArea from '../FocusArea';
import TabBar from '../TabBar';
import RightPanel from '../RightPanel';
import InfoOverlay from '../InfoOverlay';
import SettingsOverlay from '../SettingsOverlay';
import LogOverlay from '../LogOverlay';
import QueueSnapshotPanel from '../QueueSnapshotPanel';
import { DesktopViewResetButton } from '@/shared/ui/DesktopViewGate.jsx';
import Header from '@/shared/ui/layout/Header.jsx';

export default function LogisticsDashboard(props) {
    const {
    narrowScreen,
    desktopView,
    onDesktopViewClose,
    headerSnapshot,
    activeTab,
    onTabChange,
    autoMode,
    onAutoToggle,
    onSettingsOpen,
    onLogOpen,
    logOpen,
    logScope,
    logSnapshot,
    visibleEvents,
    onLogClose,
    onInfoOpen,
    rightPanelOpen,
    onRightPanelOpen,
    onRightPanelToggle,
    onFocusLogOpen,
    settingsOpen,
    simulationSettings,
    advancedOpen,
    onSettingsClose,
    onSettingsSave,
    onSettingsReset,
    onProgressReset,
    onFullReset,
    onToggleAdvanced,
    onGlobalFailureRateChange,
    onStageOverrideChange,
    infoOverlay,
    onInfoClose,
    } = props;
    const TabContent = props.TabContent;

    return (
        <div className={`theme-harbor logistics-shell${narrowScreen && desktopView ? ' logistics-desktop-forced' : ''}`}>
            {narrowScreen && desktopView && (
                <DesktopViewResetButton label="모바일로 보기" onClick={onDesktopViewClose} fixed />
            )}
            <Header />
            <div className="logistics-upper-section">
                <div className="logistics-topband logistics-visual-panel logistics-stage-learning-panel">
                    <LogisticsHeader
                        snapshot={headerSnapshot}
                        onInfoOpen={onInfoOpen}
                    />
                    <TabBar
                        activeTab={activeTab}
                        onTabChange={onTabChange}
                        autoMode={autoMode}
                        onAutoToggle={onAutoToggle}
                        onSettingsOpen={onSettingsOpen}
                        onLogOpen={onLogOpen}
                        logOpening={logOpen && logScope === 'all'}
                        retentionFull={headerSnapshot.retentionFull}
                        onRetentionClear={headerSnapshot.handleRetentionClear}
                    />
                </div>
                <FocusArea onInfoOpen={onInfoOpen} />
            </div>

            <div className="logistics-body">
                <main className="logistics-main">
                    <TabContent onInfoOpen={onInfoOpen} />
                </main>

                {!rightPanelOpen && (
                    <button
                        onClick={onRightPanelOpen}
                        className="logistics-panel-toggle"
                        style={{ position: 'absolute', right: 0, top: '50%', left: 'auto', borderRadius: '12px 0 0 12px' }}
                    >◀</button>
                )}

                <RightPanel
                    open={rightPanelOpen}
                    onToggle={onRightPanelToggle}
                    onInfoOpen={onInfoOpen}
                    onLogOpen={onFocusLogOpen}
                />
            </div>

            {settingsOpen && (
                <SettingsOverlay
                    simulationSettings={simulationSettings}
                    advancedOpen={advancedOpen}
                    onClose={onSettingsClose}
                    onSave={onSettingsSave}
                    onReset={onSettingsReset}
                    onProgressReset={onProgressReset}
                    onFullReset={onFullReset}
                    onToggleAdvanced={onToggleAdvanced}
                    onGlobalFailureRateChange={onGlobalFailureRateChange}
                    onStageOverrideChange={onStageOverrideChange}
                />
            )}

            {logOpen && (
                <LogOverlay
                    logScope={logScope}
                    logSnapshot={logSnapshot}
                    visibleEvents={visibleEvents}
                    onClose={onLogClose}
                />
            )}

            <InfoOverlay
                open={Boolean(infoOverlay)}
                title={infoOverlay?.title}
                stageLabel={infoOverlay?.stageLabel}
                summary={infoOverlay?.summary}
                bullets={infoOverlay?.bullets}
                onClose={onInfoClose}
            />

            <QueueSnapshotPanel />
        </div>
    );
}
