import { useEffect } from 'react';
import LogisticsDashboard from './components/layout/LogisticsDashboard';
import { DesktopViewGate } from '@/shared/ui/DesktopViewGate.jsx';
import { dlog, dtag } from '@/global/chs';
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
import './LogisticsLayout.css';

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
        dtag(1, ['logistics', 'scheduler', 'ui'], '진행 스케줄러 라이프사이클 블록 (REQ-T2-070)');
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
        <LogisticsDashboard
            narrowScreen={narrowScreen}
            desktopView={desktopView}
            onDesktopViewClose={handleDesktopViewClose}
            headerSnapshot={headerSnapshot}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            autoMode={autoMode}
            onAutoToggle={handleAutoToggle}
            onSettingsOpen={handleSettingsOpenWithInit}
            onLogOpen={handleLogOpen}
            logOpen={logOpen}
            logScope={logScope}
            logSnapshot={logSnapshot}
            visibleEvents={visibleEvents}
            onLogClose={() => setLogOpen(false)}
            onInfoOpen={handleInfoOverlayOpen}
            rightPanelOpen={rightPanelOpen}
            onRightPanelOpen={() => setRightPanel(true)}
            onRightPanelToggle={toggleRightPanel}
            onFocusLogOpen={handleFocusLogOpen}
            TabContent={TabContent}
            settingsOpen={settingsOpen}
            simulationSettings={simulationSettings}
            advancedOpen={advancedOpen}
            onSettingsClose={handleSettingsClose}
            onSettingsSave={handleSettingsSaveAndClose}
            onSettingsReset={handleSettingsReset}
            onProgressReset={handleProgressReset}
            onFullReset={handleFullReset}
            onToggleAdvanced={toggleAdvanced}
            onGlobalFailureRateChange={handleGlobalFailureRateChange}
            onStageOverrideChange={handleStageOverrideChange}
            infoOverlay={infoOverlay}
            onInfoClose={() => setInfoOverlay(null)}
        />
    );

    if (narrowScreen && desktopView) {
        return <div className="logistics-desktop-scrollport">{dashboard}</div>;
    }

    return dashboard;
}
