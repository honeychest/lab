import { PIPELINE_STAGES, INBOUND_STAGES } from '@/domain/logistics/common/stages';

const STORAGE_KEY = 'logistics.simulationSettings';
const DEFAULT_GLOBAL_FAILURE_RATE = 5;
const SIMULATION_STAGES = [...PIPELINE_STAGES, ...INBOUND_STAGES];

export function getDefaultSimulationSettings() {
    return {
        globalFailureRate: DEFAULT_GLOBAL_FAILURE_RATE,
        stageOverrides: syncStageOverridesWithGlobal(DEFAULT_GLOBAL_FAILURE_RATE),
    };
}

export function syncStageOverridesWithGlobal(globalFailureRate) {
    const normalized = Math.max(0, Math.min(100, Math.round(globalFailureRate)));
    return SIMULATION_STAGES.reduce((acc, stage) => {
        acc[stage] = normalized;
        return acc;
    }, {});
}

function normalizeSettings(raw) {
    const defaults = getDefaultSimulationSettings();
    const globalFailureRate = Number.isFinite(raw?.globalFailureRate)
        ? Math.max(0, Math.min(100, Math.round(raw.globalFailureRate)))
        : defaults.globalFailureRate;

    const stageOverrides = { ...defaults.stageOverrides };
    for (const stage of SIMULATION_STAGES) {
        const value = raw?.stageOverrides?.[stage];
        if (Number.isFinite(value)) {
            stageOverrides[stage] = Math.max(0, Math.min(100, Math.round(value)));
        }
    }

    const looksLikeLegacyZeroOverrides = SIMULATION_STAGES.every(stage => stageOverrides[stage] === 0) && globalFailureRate > 0;
    if (looksLikeLegacyZeroOverrides) {
        return {
            globalFailureRate,
            stageOverrides: syncStageOverridesWithGlobal(globalFailureRate),
        };
    }

    return { globalFailureRate, stageOverrides };
}

export function getSimulationSettings() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return getDefaultSimulationSettings();
        return normalizeSettings(JSON.parse(raw));
    } catch {
        return getDefaultSimulationSettings();
    }
}

export function saveSimulationSettings(settings) {
    const normalized = normalizeSettings(settings);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
}

export function resetSimulationSettings() {
    const defaults = getDefaultSimulationSettings();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
}

export function getFailureRateForStage(stage, settingsLike) {
    const normalized = normalizeSettings(settingsLike);
    const override = normalized.stageOverrides?.[stage];
    if (Number.isFinite(override)) {
        return Math.max(0, Math.min(100, Math.round(override)));
    }
    return normalized.globalFailureRate;
}
