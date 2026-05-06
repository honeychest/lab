import { useEffect } from 'react';
import LogisticsHeader from './components/LogisticsHeader';
import FocusArea       from './components/FocusArea';
import TabBar          from './components/TabBar';
import RightPanel      from './components/RightPanel';
import InfoOverlay     from './components/InfoOverlay';
import SettingsOverlay from './components/SettingsOverlay';
import LogOverlay      from './components/LogOverlay';
import { DesktopViewGate, DesktopViewResetButton } from '@/shared/ui/DesktopViewGate.jsx';
import { dlog }       from '@/global/chs';
import { startTickLoop, stopTickLoop } from '@/scheduler/tickLoop';
import { stopAutoOmsOrders } from './services/omsSimulation';
import { TAB_MAP, OverviewTab } from './constants';
import { getSimulationSettings } from './services/simulationSettings';
import useTabState from './hooks/shared/useTabState';
import useWindowState from './hooks/shared/useWindowState';
import usePanelState from './hooks/ui/usePanelState';
import useSettingsPanel from './hooks/ui/useSettingsPanel';
import useLogPanel from './hooks/ui/useLogPanel';
import useAutoMode from './hooks/simulation/useAutoMode';
import useSimulationSettings from './hooks/simulation/useSimulationSettings';
import useLogisticsReset from './hooks/useLogisticsReset';
import useLogisticsHeaderSnapshot from './hooks/useLogisticsHeaderSnapshot';
import '@/styles/themes/theme-dark.css';
import './logistics.css';

export default function LogisticsLayout() {
    const { activeTab, setActiveTab } = useTabState();
    const { narrowScreen, desktopView, handleDesktopViewOpen, handleDesktopViewClose } = useWindowState();
    const { rightPanelOpen, setRightPanel, toggleRightPanel } = usePanelState();
    const {
        settingsOpen,
        handleSettingsOpen,
        handleSettingsClose,
        infoOverlay,
        setInfoOverlay,
        handleInfoOverlayOpen,
        advancedOpen,
        toggleAdvanced,
    } = useSettingsPanel();
    const { logOpen, setLogOpen, logScope, setLogScope, logSnapshot } = useLogPanel();
    const { autoMode, setAutoMode, handleAutoToggle } = useAutoMode();
    const {
        simulationSettings,
        setSimulationSettings,
        handleGlobalFailureRateChange,
        handleStageOverrideChange,
        handleSettingsSave,
        handleSettingsReset,
    } = useSimulationSettings();
    const { handleProgressReset, handleFullReset } = useLogisticsReset({
        setActiveTab,
        setAutoMode,
        closeSettings: handleSettingsClose,
    });
    const headerSnapshot = useLogisticsHeaderSnapshot();

    useEffect(() => {
        startTickLoop();
        dlog(1, 'LogisticsLayout.tickLoop — 화면 진입 시 진행 스케줄러 활성화');
        return () => {
            stopTickLoop();
            stopAutoOmsOrders();
        };
    }, []);

    const handleSettingsOpenWithInit = () => {
        setSimulationSettings(getSimulationSettings());
        handleSettingsOpen();
        dlog(1, 'LogisticsLayout.settings — 설정 팝업 오픈');
    };

    const handleSettingsSaveAndClose = async () => {
        await handleSettingsSave();
        handleSettingsClose();
    };

    const handleLogOpen = () => {
        setLogScope('all');
        setLogOpen(true);
        dlog(1, 'LogisticsLayout.log — 전체 로그 오버레이 열기');
    };

    const handleFocusLogOpen = () => {
        setLogScope('focus');
        setLogOpen(true);
        dlog(1, 'LogisticsLayout.log — 포커스 로그 오버레이 열기');
    };

    const TabContent = TAB_MAP[activeTab] ?? OverviewTab;
    const visibleEvents = logScope === 'focus'
        ? logSnapshot.events.filter(event => event.aggregateId === logSnapshot.focusedTaskId)
        : logSnapshot.events;

    if (narrowScreen && !desktopView) {
        return (
            <div className="theme-harbor logistics-mobile-gate">
                <DesktopViewGate
                    message="데스크톱 화면에서만 물류 운영 화면을 사용할 수 있습니다."
                    onAction={handleDesktopViewOpen}
                />
            </div>
        );
    }

    const dashboard = (
        <div className={`theme-harbor logistics-shell${narrowScreen && desktopView ? ' logistics-desktop-forced' : ''}`}>
            {narrowScreen && desktopView && (
                <DesktopViewResetButton label="모바일로 보기" onClick={handleDesktopViewClose} fixed />
            )}
            <LogisticsHeader
                snapshot={headerSnapshot}
                onInfoOpen={handleInfoOverlayOpen}
            />
            <TabBar
                activeTab={activeTab}
                onTabChange={setActiveTab}
                autoMode={autoMode}
                onAutoToggle={handleAutoToggle}
                onSettingsOpen={handleSettingsOpenWithInit}
                onLogOpen={handleLogOpen}
                logOpening={logOpen && logScope === 'all'}
                retentionFull={headerSnapshot.retentionFull}
                onRetentionClear={headerSnapshot.handleRetentionClear}
            />
            <FocusArea onInfoOpen={handleInfoOverlayOpen} />

            <div className="logistics-body">
                <main className="logistics-main">
                    <TabContent onInfoOpen={handleInfoOverlayOpen} />
                </main>

                {!rightPanelOpen && (
                    <button
                        onClick={() => setRightPanel(true)}
                        className="logistics-panel-toggle"
                        style={{ position: 'absolute', right: 0, top: '50%', left: 'auto', borderRadius: '12px 0 0 12px' }}
                    >◀</button>
                )}

                <RightPanel open={rightPanelOpen} onToggle={toggleRightPanel} onInfoOpen={handleInfoOverlayOpen} onLogOpen={handleFocusLogOpen} />
            </div>

            {settingsOpen && (
                <SettingsOverlay
                    simulationSettings={simulationSettings}
                    advancedOpen={advancedOpen}
                    onClose={handleSettingsClose}
                    onSave={handleSettingsSaveAndClose}
                    onReset={handleSettingsReset}
                    onProgressReset={handleProgressReset}
                    onFullReset={handleFullReset}
                    onToggleAdvanced={toggleAdvanced}
                    onGlobalFailureRateChange={handleGlobalFailureRateChange}
                    onStageOverrideChange={handleStageOverrideChange}
                />
            )}

            {logOpen && (
                <LogOverlay
                    logScope={logScope}
                    logSnapshot={logSnapshot}
                    visibleEvents={visibleEvents}
                    onClose={() => setLogOpen(false)}
                />
            )}

            <InfoOverlay
                open={Boolean(infoOverlay)}
                title={infoOverlay?.title}
                stageLabel={infoOverlay?.stageLabel}
                summary={infoOverlay?.summary}
                bullets={infoOverlay?.bullets}
                onClose={() => setInfoOverlay(null)}
            />
        </div>
    );

    if (narrowScreen && desktopView) {
        return <div className="logistics-desktop-scrollport">{dashboard}</div>;
    }

    return dashboard;
}
