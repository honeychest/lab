import { useState, useEffect, useCallback } from 'react';
import LogisticsHeader from './components/LogisticsHeader';
import FocusArea       from './components/FocusArea';
import TabBar          from './components/TabBar';
import RightPanel      from './components/RightPanel';
import InfoOverlay     from './components/InfoOverlay';
import OverviewTab     from './tabs/OverviewTab';
import OmsTab          from './tabs/OmsTab';
import WmsTab          from './tabs/WmsTab';
import TmsTab          from './tabs/TmsTab';
import ListTab         from './tabs/ListTab';
import { dlog, dtag }  from '@/global/chs';
import { emitter }     from '@/domain/logistics/common/emitter';
import { startTickLoop, stopTickLoop } from '@/scheduler/tickLoop';
import { startAutoOmsOrders, stopAutoOmsOrders } from './services/omsSimulation';
import { clearAllTasks } from '@/store/taskStore';
import { clearEventStore, getAllEvents } from '@/store/eventStore';
import { appendAuditEvent } from '@/store/auditStore';
import { getFocusedTaskId, resetFocusState } from '@/store/focusStore';
import { PIPELINE_STAGES, INBOUND_STAGES, STAGE_LABELS } from '@/domain/logistics/common/stages';
import {
    getSimulationSettings,
    saveSimulationSettings,
    resetSimulationSettings,
    syncStageOverridesWithGlobal,
} from './services/simulationSettings';
import '@/styles/themes/theme-dark.css';
import './logistics.css';

const TAB_STORAGE_KEY = 'logistics.activeTab';

const TAB_MAP = {
    overview: OverviewTab,
    oms:      OmsTab,
    wms:      WmsTab,
    tms:      TmsTab,
    list:     ListTab,
};
const SETTINGS_STAGES = [...PIPELINE_STAGES, ...INBOUND_STAGES];

function formatLogTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('ko-KR', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function summarizeEvent(event) {
    if (event.eventType === 'inbound.received') return '입고 등록';
    if (event.eventType === 'inbound.validated') return '입고 유효성 통과';
    if (event.eventType === 'inbound.zone.assigned') return '입고 Zone 배정';
    if (event.eventType === 'inbound.stored') return '입고 재고 반영';
    if (event.eventType === 'inbound.completed') return '입고 완료';
    if (event.eventType === 'task.failed.simulated' || event.eventType === 'task.failed.injected') {
        return event.payload?.failureLabel ?? event.payload?.reason ?? '실패';
    }

    if (event.eventType === 'task.recovered') {
        return event.payload?.actionLabel ? `조치: ${event.payload.actionLabel}` : '복구';
    }

    if (event.eventType.startsWith('audit.')) {
        return event.eventType;
    }

    return event.routingKey;
}

export default function LogisticsLayout() {
    const [activeTab, setActiveTab]       = useState(() => localStorage.getItem(TAB_STORAGE_KEY) ?? 'overview');
    const [autoMode, setAutoMode]         = useState(false);
    const [rightPanelOpen, setRightPanel] = useState(() => !window.matchMedia('(max-width: 1280px)').matches);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [logOpen, setLogOpen]           = useState(false);
    const [infoOverlay, setInfoOverlay]   = useState(null);
    const [simulationSettings, setSimulationSettings] = useState(() => getSimulationSettings());
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [logScope, setLogScope] = useState('focus');
    const [logSnapshot, setLogSnapshot] = useState({ events: [], focusedTaskId: null });

    // 탭 상태 LocalStorage 저장 (REQ-T2-027)
    useEffect(() => {
        localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }, [activeTab]);

    // 1280px 이하 우측 패널 자동 접기 (REQ-T2-031) — 초기값은 useState 지연 초기화로 설정
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1280px)');
        const handler = (e) => { if (e.matches) setRightPanel(false); };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const handleAutoToggle = () => {
        const next = !autoMode;
        setAutoMode(next);
        if (next) {
            startAutoOmsOrders();
            dlog(1, 'LogisticsLayout.autoToggle — Auto 시작. OMS 접수 자동 생성 활성화 (REQ-T2-032)');
        } else {
            stopAutoOmsOrders();
            dlog(1, 'LogisticsLayout.autoToggle — Auto 정지. 신규 주문 생성만 중단, 진행 중 Task는 계속 진행');
        }
    };

    useEffect(() => {
        startTickLoop();
        dlog(1, 'LogisticsLayout.tickLoop — 화면 진입 시 진행 스케줄러 활성화');
        return () => {
        stopTickLoop();
        stopAutoOmsOrders();
        };
    }, []);

    const handleSettingsOpen = () => {
        setSimulationSettings(getSimulationSettings());
        setSettingsOpen(true);
        dlog(1, 'LogisticsLayout.settings — 설정 팝업 오픈');
    };

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
        setSettingsOpen(false);
        await appendAuditEvent('audit.settings.saved', {
            globalFailureRate: saved.globalFailureRate,
        }, {
            aggregateId: 'settings',
            actor: 'operator',
        });
        dlog(1, `LogisticsLayout.settingsSave — 예외율 저장 완료 (${saved.globalFailureRate}%)`);
        dlog(2, 'LogisticsLayout.settingsSave — co에서 설정 변경 audit.* 저장과 적용 시점 정책 영속화 지점 (REQ-T2-049)', saved.globalFailureRate);
    };

    const handleSettingsReset = () => {
        const defaults = resetSimulationSettings();
        setSimulationSettings(defaults);
        dlog(1, 'LogisticsLayout.settingsReset — 예외율 설정 기본값 복원');
    };

    const handleProgressReset = async () => {
        dtag(2, ['logistics', 'reset', 'event'], '진행 데이터 리셋과 이벤트 저장소 초기화 블록');
        stopAutoOmsOrders();
        setAutoMode(false);
        await appendAuditEvent('audit.reset.performed', {
            scope: 'partial',
        }, {
            aggregateId: 'dashboard',
            actor: 'operator',
        });
        await clearAllTasks();
        await clearEventStore();
        resetFocusState();
        dlog(1, 'LogisticsLayout.resetProgress — 진행 데이터 리셋 완료');
        dlog(2, 'LogisticsLayout.resetProgress — co에서 진행 데이터 초기화 audit/event 저장 지점 (REQ-T2-055/049 [pu→co])');
        setSettingsOpen(false);
    };

    const handleFullReset = async () => {
        dtag(2, ['logistics', 'reset', 'audit'], '전체 초기화 확인 절차와 감사 로그 연결 블록');
        stopAutoOmsOrders();
        setAutoMode(false);
        localStorage.removeItem(TAB_STORAGE_KEY);
        setActiveTab('overview');
        await appendAuditEvent('audit.reset.performed', {
            scope: 'full',
        }, {
            aggregateId: 'dashboard',
            actor: 'operator',
        });
        await clearAllTasks();
        await clearEventStore();
        resetFocusState();
        dlog(1, 'LogisticsLayout.resetAll — 완전 초기화 완료. 시드/설정 복원은 L3 구현');
        dlog(2, 'LogisticsLayout.resetAll — co에서 RESET 확인 절차와 전체 초기화 감사 로그 연결 지점 (REQ-T2-055 [pu→co])');
        setSettingsOpen(false);
    };

    const handleLogOpen = () => {
        setLogOpen(true);
        dlog(1, 'LogisticsLayout.log — 전체 로그 오버레이 열기');
    };

    const refreshLogSnapshot = useCallback(async () => {
        const [events] = await Promise.all([
            getAllEvents(),
        ]);

        setLogSnapshot({
            events,
            focusedTaskId: getFocusedTaskId(),
        });
    }, []);

    const handleInfoOverlayOpen = (payload) => {
        setInfoOverlay(payload);
    };

    useEffect(() => {
        if (!logOpen) return undefined;

        const initialRefreshTimer = window.setTimeout(() => {
            void refreshLogSnapshot();
        }, 0);

        const onLogChanged = () => refreshLogSnapshot();
        const onFocusChanged = ({ taskId }) => {
            setLogSnapshot(current => ({ ...current, focusedTaskId: taskId ?? null }));
        };

        emitter.on('logistics:event', onLogChanged);
        emitter.on('logistics:focus:changed', onFocusChanged);
        emitter.on('logistics:retention:cleared', onLogChanged);

        return () => {
            window.clearTimeout(initialRefreshTimer);
            emitter.off('logistics:event', onLogChanged);
            emitter.off('logistics:focus:changed', onFocusChanged);
            emitter.off('logistics:retention:cleared', onLogChanged);
        };
    }, [logOpen, refreshLogSnapshot]);

    const TabContent = TAB_MAP[activeTab] ?? OverviewTab;
    const visibleEvents = logScope === 'focus' && logSnapshot.focusedTaskId
        ? logSnapshot.events.filter(event => event.aggregateId === logSnapshot.focusedTaskId)
        : logSnapshot.events;

    return (
        <div className="theme-harbor logistics-shell">
            <LogisticsHeader
                autoMode={autoMode}
                onAutoToggle={handleAutoToggle}
                onSettingsOpen={handleSettingsOpen}
                onLogOpen={handleLogOpen}
                onInfoOpen={handleInfoOverlayOpen}
            />
            <FocusArea onInfoOpen={handleInfoOverlayOpen} />
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

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

                <RightPanel open={rightPanelOpen} onToggle={() => setRightPanel(p => !p)} onInfoOpen={handleInfoOverlayOpen} />
            </div>

            {/* 설정 팝업 자리 — L4 구현 */}
            {settingsOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'var(--dark-overlay-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
                }} onClick={() => setSettingsOpen(false)}>
                    <div className="logistics-side-section" style={{ background: 'var(--dark-modal-bg)', minWidth: '360px', maxWidth: '460px' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="logistics-side-title">설정</div>
                        <p className="logistics-task-meta">예외율 설정은 여기서 합니다. 저장값은 다음 생성 작업부터 적용하는 정책으로 고정합니다.</p>
                        <div className="logistics-settings-stack">
                            <div className="logistics-settings-card">
                                <div className="logistics-settings-label-row">
                                    <span className="logistics-side-title" style={{ marginBottom: 0 }}>예외·분기</span>
                                    <span className="logistics-meta-pill">글로벌 {simulationSettings.globalFailureRate}%</span>
                                </div>
                                <label className="logistics-slider-wrap">
                                    <span className="logistics-task-meta">글로벌 예외율 · 변경 시 단계별 값도 같이 맞춤</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={simulationSettings.globalFailureRate}
                                        onChange={(e) => handleGlobalFailureRateChange(e.target.value)}
                                    />
                                </label>
                                <button
                                    type="button"
                                    className="logistics-outline-btn"
                                    onClick={() => setAdvancedOpen(open => !open)}
                                >
                                    {advancedOpen ? '고급 숨기기' : '고급 보기'}
                                </button>
                                {advancedOpen && (
                                    <div className="logistics-settings-advanced" style={{ maxHeight: '280px', overflowY: 'auto', paddingRight: '6px' }}>
                                        <div className="logistics-task-meta" style={{ marginTop: 0 }}>
                                            단계별 슬라이더는 시연용 고급 옵션입니다. 위치는 나중에 정하고, 지금은 스크롤 영역 안에서만 단순 노출합니다.
                                        </div>
                                        {SETTINGS_STAGES.map(stage => {
                                            const override = simulationSettings.stageOverrides[stage] ?? 0;
                                            return (
                                                <label key={stage} className="logistics-slider-wrap compact">
                                                    <span className="logistics-settings-stage">
                                                        <span>{STAGE_LABELS[stage]}</span>
                                                        <span className={`logistics-meta-pill${override === simulationSettings.globalFailureRate ? ' logistics-sync-pill' : ' logistics-override-pill'}`}>
                                                            {override === simulationSettings.globalFailureRate ? `글로벌 동기화 ${override}%` : `개별 ${override}%`}
                                                        </span>
                                                    </span>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="100"
                                                        step="1"
                                                        value={override}
                                                        onChange={(e) => handleStageOverrideChange(stage, e.target.value)}
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="logistics-settings-card logistics-settings-note">
                                <div className="logistics-side-title">실패 확인 경로</div>
                                <p className="logistics-task-meta">현재는 우측 패널 `분기 주입` 버튼으로 실패를 즉시 만들 수 있습니다. 누르면 작업 상태가 `failed`로 바뀌고 이력 체인에 이벤트가 남습니다.</p>
                            </div>
                        </div>
                        <div className="logistics-button-row">
                            <button className="logistics-primary-btn" onClick={handleSettingsSave}>저장</button>
                            <button className="logistics-outline-btn" onClick={handleSettingsReset}>기본값 복원</button>
                            <button className="logistics-secondary-btn" onClick={handleProgressReset}>진행 데이터 리셋</button>
                            <button className="logistics-danger-btn" onClick={handleFullReset}>완전 초기화</button>
                            <button className="logistics-outline-btn" onClick={() => setSettingsOpen(false)}>닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {logOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'var(--dark-overlay-bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
                }} onClick={() => setLogOpen(false)}>
                    <div className="logistics-side-section logistics-log-overlay-card" style={{ background: 'var(--dark-modal-bg)' }}
                        onClick={e => e.stopPropagation()}>
                        <div className="logistics-log-overlay-header">
                            <div>
                                <div className="logistics-side-title">전체 로그</div>
                                <p className="logistics-task-meta">
                                    {logScope === 'focus' && logSnapshot.focusedTaskId
                                        ? `포커스 task ${logSnapshot.focusedTaskId} 기준 ${visibleEvents.length}건`
                                        : `전체 이벤트 ${visibleEvents.length}건`}
                                </p>
                            </div>
                            <div className="logistics-button-row">
                                <button
                                    className={logScope === 'focus' ? 'logistics-primary-btn' : 'logistics-outline-btn'}
                                    onClick={() => setLogScope('focus')}
                                >
                                    포커스
                                </button>
                                <button
                                    className={logScope === 'all' ? 'logistics-primary-btn' : 'logistics-outline-btn'}
                                    onClick={() => setLogScope('all')}
                                >
                                    전체
                                </button>
                            </div>
                        </div>
                        <div className="logistics-log-overlay-summary">
                            <span className="logistics-meta-pill">포커스 {logSnapshot.focusedTaskId ?? '없음'}</span>
                            <span className="logistics-meta-pill">전체 적재 {logSnapshot.events.length}건</span>
                            <span className="logistics-meta-pill">현재 보기 {visibleEvents.length}건</span>
                        </div>
                        <div className="logistics-log-list">
                            {visibleEvents.length > 0 ? visibleEvents.slice().reverse().map(event => (
                                <div key={event.eventId} className="logistics-log-row">
                                    <div className="logistics-log-row-top">
                                        <span className="logistics-log-key">{event.routingKey}</span>
                                        <span className="logistics-log-time">{formatLogTimestamp(event.timestamp)}</span>
                                    </div>
                                    <div className="logistics-log-row-meta">
                                        <span>{event.aggregateId}</span>
                                        <span>{event.actor}</span>
                                        <span>{event.correlationId.slice(0, 8)}</span>
                                    </div>
                                    <div className="logistics-log-row-summary">{summarizeEvent(event)}</div>
                                </div>
                            )) : (
                                <div className="logistics-empty-card">
                                    {logScope === 'focus'
                                        ? '포커스 task 이력이 없습니다. 다른 task 선택 또는 전체 보기로 전환하세요.'
                                        : '표시할 이벤트가 없습니다.'}
                                </div>
                            )}
                        </div>
                        <div className="logistics-button-row">
                            <button className="logistics-outline-btn" onClick={() => setLogOpen(false)}>닫기</button>
                        </div>
                    </div>
                </div>
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
}
