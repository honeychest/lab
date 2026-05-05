import { useState } from 'react';
import { dtag, dlog } from '@/global/chs';
import { appendAuditEvent } from '@/store/auditStore';
import {
    getSimulationSettings,
    saveSimulationSettings,
    resetSimulationSettings,
    syncStageOverridesWithGlobal,
} from '../../services/simulationSettings';

export default function useSimulationSettings() {
    const [simulationSettings, setSimulationSettings] = useState(() => getSimulationSettings());

    const handleGlobalFailureRateChange = (value) => {
        const globalFailureRate = Number(value);
        setSimulationSettings(current => ({
            ...current,
            globalFailureRate,
            stageOverrides: syncStageOverridesWithGlobal(globalFailureRate),
        }));
    };

    const handleStageOverrideChange = (stage, value) => {
        setSimulationSettings(current => ({
            ...current,
            stageOverrides: {
                ...current.stageOverrides,
                [stage]: Number(value),
            },
        }));
    };

    const handleSettingsSave = async () => {
        dtag(2, ['logistics', 'settings', 'audit'], '예외율 설정 저장과 감사 로그 영속화 블록');
        const saved = saveSimulationSettings(simulationSettings);
        setSimulationSettings(saved);
        await appendAuditEvent('audit.settings.saved', {
            globalFailureRate: saved.globalFailureRate,
        }, {
            aggregateId: 'settings',
            actor: 'operator',
        });
        dlog(1, `LogisticsLayout.settingsSave — 예외율 저장 완료 (${saved.globalFailureRate}%)`);
        dlog(2, 'LogisticsLayout.settingsSave — co에서 설정 변경 audit.* 저장과 적용 시점 정책 영속화 지점 (REQ-T2-049)', saved.globalFailureRate);
        return saved;
    };

    const handleSettingsReset = () => {
        const defaults = resetSimulationSettings();
        setSimulationSettings(defaults);
        dlog(1, 'LogisticsLayout.settingsReset — 예외율 설정 기본값 복원');
        return defaults;
    };

    return {
        simulationSettings,
        setSimulationSettings,
        handleGlobalFailureRateChange,
        handleStageOverrideChange,
        handleSettingsSave,
        handleSettingsReset,
    };
}
