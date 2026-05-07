import { dlog } from '@/global/chs';
import { getSimulationSettings } from '../services/simulationSettings';
import { performBranchInject, performRecoveryAction } from '../services/recoveryActions';

export default function useLogisticsActions({
    setSimulationSettings,
    openSettings,
    closeSettings,
    saveSettings,
    setLogScope,
    setLogOpen,
    selectedTask,
}) {
    const openSettingsWithInit = () => {
        setSimulationSettings(getSimulationSettings());
        openSettings();
        dlog(1, 'LogisticsLayout.settings — 설정 팝업 오픈');
    };

    const saveSettingsAndClose = async () => {
        await saveSettings();
        closeSettings();
    };

    const openAllLog = () => {
        setLogScope('all');
        setLogOpen(true);
        dlog(1, 'LogisticsLayout.log — 전체 로그 오버레이 열기');
    };

    const openFocusLog = () => {
        setLogScope('focus');
        setLogOpen(true);
        dlog(1, 'LogisticsLayout.log — 포커스 로그 오버레이 열기');
    };

    const runRecoveryAction = async (action) => {
        if (!selectedTask) return;
        await performRecoveryAction(selectedTask, action);
    };

    const runBranchInject = async (failureCode) => {
        if (!selectedTask) return;
        await performBranchInject(selectedTask, failureCode);
    };

    return {
        openSettingsWithInit,
        saveSettingsAndClose,
        openAllLog,
        openFocusLog,
        runRecoveryAction,
        runBranchInject,
    };
}
