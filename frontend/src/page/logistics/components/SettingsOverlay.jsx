import { PIPELINE_STAGES, INBOUND_STAGES, STAGE_LABELS } from '@/domain/logistics/common/stages';

const SETTINGS_STAGES = [...PIPELINE_STAGES, ...INBOUND_STAGES];

export default function SettingsOverlay({
    simulationSettings,
    advancedOpen,
    onClose,
    onSave,
    onReset,
    onProgressReset,
    onFullReset,
    onToggleAdvanced,
    onGlobalFailureRateChange,
    onStageOverrideChange,
}) {
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'var(--dark-overlay-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={onClose}>
            <div className="logistics-side-section" style={{ background: 'var(--dark-modal-bg)', minWidth: '360px', maxWidth: '460px' }}
                onClick={event => event.stopPropagation()}>
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
                                onChange={(event) => onGlobalFailureRateChange(event.target.value)}
                            />
                        </label>
                        <button
                            type="button"
                            className="logistics-outline-btn"
                            onClick={onToggleAdvanced}
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
                                                onChange={(event) => onStageOverrideChange(stage, event.target.value)}
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
                    <button className="logistics-primary-btn" onClick={onSave}>저장</button>
                    <button className="logistics-outline-btn" onClick={onReset}>기본값 복원</button>
                    <button className="logistics-secondary-btn" onClick={onProgressReset}>진행 데이터 리셋</button>
                    <button className="logistics-danger-btn" onClick={onFullReset}>완전 초기화</button>
                    <button className="logistics-outline-btn" onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    );
}
