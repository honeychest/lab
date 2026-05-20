import { useEffect } from 'react';
import LogisticsDashboard from './components/layout/LogisticsDashboard';
import LogisticsMobileDashboard from './components/layout/LogisticsMobileDashboard';
import LogisticsOverlays from './components/layout/LogisticsOverlays';
import { dlog, dtag } from '@/global/chs';
import { stopTickLoop } from '@/scheduler/tickLoop';
import { startOmsConsumer, stopOmsConsumer } from '@/domain/logistics/oms/consumer';
import { startWmsConsumer, stopWmsConsumer } from '@/domain/logistics/wms/consumer';
import { startQmsConsumer, stopQmsConsumer } from '@/domain/logistics/qms/consumer';
import { startTmsConsumer, stopTmsConsumer } from '@/domain/logistics/tms/consumer';
import { startEosConsumer, stopEosConsumer } from '@/domain/logistics/eos/consumer';
import { startInboundConsumer, stopInboundConsumer } from '@/domain/logistics/inbound/consumer';
import { startAftConsumer, stopAftConsumer } from '@/domain/logistics/aft/consumer';
import { stopAutoOmsOrders } from './services/omsSimulation';
import { stopAutoEosTasks } from './services/eosSimulation';
import { TAB_MAP, OverviewTab } from './constants';
import useTabState from './hooks/shared/useTabState';
import useWindowState from './hooks/shared/useWindowState';
import usePanelState from './hooks/ui/usePanelState';
import useSettingsPanel from './hooks/ui/useSettingsPanel';
import useLogPanel from './hooks/ui/useLogPanel';
import useAutoMode from './hooks/simulation/useAutoMode';
import useSimulationSettings from './hooks/simulation/useSimulationSettings';
import useLogisticsReset from './hooks/useLogisticsReset';
import useLogisticsHeaderSnapshot from './hooks/useLogisticsHeaderSnapshot';
import useLogisticsFocusedTask from './hooks/useLogisticsFocusedTask';
import useLogisticsActions from './hooks/useLogisticsActions';
import '@/styles/themes/theme-dark.css';
import './LogisticsLayout.css';

export default function LogisticsLayout() {
    const { activeTab, setActiveTab } = useTabState();
    const {
        narrowScreen,
        desktopView,
        handleDesktopViewOpen,
        handleDesktopViewClose,
    } = useWindowState();
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
    const { logOpen, setLogOpen, logScope, setLogScope, logSnapshot, visibleEvents } = useLogPanel();
    const { autoMode, handleAutoToggle, resetModes } = useAutoMode();
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
        resetModes,
        closeSettings: handleSettingsClose,
    });
    const headerSnapshot = useLogisticsHeaderSnapshot();
    const {
        focusedTask,
        latestFocusedEvent,
        selectTask,
        selectEventTask,
    } = useLogisticsFocusedTask(headerSnapshot.allTaskList);
    const actions = useLogisticsActions({
        setSimulationSettings,
        openSettings: handleSettingsOpen,
        closeSettings: handleSettingsClose,
        saveSettings: handleSettingsSave,
        setLogScope,
        setLogOpen,
        selectedTask: focusedTask,
    });

    useEffect(() => {
        dtag(1, ['logistics', 'scheduler', 'ui'], '진행 스케줄러 라이프사이클 블록 (REQ-T2-070)');
        startOmsConsumer();
        startWmsConsumer();
        startQmsConsumer();
        startTmsConsumer();
        startEosConsumer();
        startInboundConsumer();
        startAftConsumer();
        dlog(1, 'LogisticsLayout.tickLoop — 화면 진입 시 7개 도메인 consumer 활성화, 시뮬레이션은 수동 시작');
        return () => {
            stopTickLoop();
            stopOmsConsumer();
            stopWmsConsumer();
            stopQmsConsumer();
            stopTmsConsumer();
            stopEosConsumer();
            stopInboundConsumer();
            stopAftConsumer();
            stopAutoOmsOrders();
            stopAutoEosTasks();
        };
    }, []);

    const handleMobileLogEventSelect = (event) => {
        if (!event?.aggregateId) return;
        selectEventTask(event);
        setLogOpen(false);
    };

    const TabContent = TAB_MAP[activeTab] ?? OverviewTab;

    if (narrowScreen && !desktopView) {
        return (
            <>
                <LogisticsMobileDashboard
                    headerSnapshot={headerSnapshot}
                    autoMode={autoMode}
                    onAutoToggle={handleAutoToggle}
                    onSettingsOpen={actions.openSettingsWithInit}
                    onLogOpen={actions.openAllLog}
                    logOpen={logOpen}
                    logScope={logScope}
                    selectedTask={focusedTask}
                    latestSelectedEvent={latestFocusedEvent}
                    onTaskSelect={selectTask}
                    onRecoveryAction={actions.runRecoveryAction}
                    onBranchInject={actions.runBranchInject}
                    onDesktopViewOpen={handleDesktopViewOpen}
                />
                <LogisticsOverlays
                    settingsOpen={settingsOpen}
                    settingsProps={{
                        simulationSettings,
                        advancedOpen,
                        onClose: handleSettingsClose,
                        onSave: actions.saveSettingsAndClose,
                        onReset: handleSettingsReset,
                        onProgressReset: handleProgressReset,
                        onFullReset: handleFullReset,
                        onToggleAdvanced: toggleAdvanced,
                        onGlobalFailureRateChange: handleGlobalFailureRateChange,
                        onStageOverrideChange: handleStageOverrideChange,
                    }}
                    logOpen={logOpen}
                    logProps={{
                        logScope,
                        logSnapshot,
                        visibleEvents,
                        onClose: () => setLogOpen(false),
                        onEventSelect: handleMobileLogEventSelect,
                    }}
                />
            </>
        );
    }

    return (
        <LogisticsDashboard
            narrowScreen={narrowScreen}
            desktopView={desktopView}
            onDesktopViewClose={handleDesktopViewClose}
            headerSnapshot={headerSnapshot}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            autoMode={autoMode}
            onAutoToggle={handleAutoToggle}
            onSettingsOpen={actions.openSettingsWithInit}
            onLogOpen={actions.openAllLog}
            logOpen={logOpen}
            logScope={logScope}
            logSnapshot={logSnapshot}
            visibleEvents={visibleEvents}
            onLogClose={() => setLogOpen(false)}
            onInfoOpen={handleInfoOverlayOpen}
            rightPanelOpen={rightPanelOpen}
            onRightPanelOpen={() => setRightPanel(true)}
            onRightPanelToggle={toggleRightPanel}
            onFocusLogOpen={actions.openFocusLog}
            TabContent={TabContent}
            settingsOpen={settingsOpen}
            simulationSettings={simulationSettings}
            advancedOpen={advancedOpen}
            onSettingsClose={handleSettingsClose}
            onSettingsSave={actions.saveSettingsAndClose}
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
}
