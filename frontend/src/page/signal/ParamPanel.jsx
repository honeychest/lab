// [AGENT] TASK-11: ParamPanel — ⚙ 드롭다운 파라미터 패널 (관리자 전용)
// 슬라이더: vol_window(50~500), trigger_multiplier(1~30), strip_count(3~10)
// PUT 실패 시 롤백, 저장중 버튼 비활성화
import { useState, useRef, useEffect } from 'react';

const SLIDER_CONFIGS = [
    { key: 'vol_window',          label: '변동성 윈도우',   min: 50,  max: 500, step: 10,  unit: '봉' },
    { key: 'trigger_multiplier',  label: '트리거 배수',     min: 1,   max: 30,  step: 0.5, unit: '×' },
    { key: 'strip_count',         label: '패턴 표시 개수',  min: 3,   max: 10,  step: 1,   unit: '개' },
];

export default function ParamPanel({ params, onParamsSave }) {
    const [local, setLocal] = useState({
        vol_window:         params?.vol_window         ?? 200,
        trigger_multiplier: params?.trigger_multiplier ?? 10,
        strip_count:        params?.strip_count        ?? 7,
    });
    const [saving, setSaving] = useState(false);
    const prevParamsRef = useRef(null);

    // params 변경 시 로컬 상태 동기화 (외부 롤백 반영)
    useEffect(() => {
        if (params) {
            setLocal({
                vol_window:         params.vol_window         ?? 200,
                trigger_multiplier: params.trigger_multiplier ?? 10,
                strip_count:        params.strip_count        ?? 7,
            });
        }
    }, [params]);

    const handleSave = async () => {
        prevParamsRef.current = { ...local };
        setSaving(true);
        try {
            await onParamsSave(local);
        } catch {
            // PUT 실패 → 롤백
            if (prevParamsRef.current) {
                setLocal(prevParamsRef.current);
            }
        } finally {
            setSaving(false);
        }
    };

    const panelStyle = {
        position: 'absolute',
        top: '48px',
        right: '0',
        zIndex: 100,
        backgroundColor: 'var(--black-panel-alt-bg)',
        border: '1px solid var(--black-border-strong)',
        borderRadius: '8px',
        padding: '16px',
        minWidth: '240px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        fontFamily: "'Pretendard', sans-serif",
    };

    const labelStyle = {
        fontSize: '11px',
        color: 'var(--black-text-secondary)',
        marginBottom: '6px',
        display: 'flex',
        justifyContent: 'space-between',
    };

    const valueStyle = {
        color: 'var(--black-text-primary)',
        fontWeight: '600',
        fontSize: '12px',
    };

    return (
        <div style={panelStyle}>
            <div style={{ fontSize: '12px', color: 'var(--black-text-primary)', fontWeight: '700', marginBottom: '14px', letterSpacing: '0.4px' }}>
                ⚙ 파라미터 설정
            </div>

            {SLIDER_CONFIGS.map(({ key, label, min, max, step, unit }) => (
                <div key={key} style={{ marginBottom: '14px' }}>
                    <div style={labelStyle}>
                        <span>{label}</span>
                        <span style={valueStyle}>
                            {key === 'trigger_multiplier' ? `${unit}${local[key]}` : `${local[key]}${unit}`}
                        </span>
                    </div>
                    <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={local[key]}
                        onChange={(e) => setLocal((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                        disabled={saving}
                        style={{
                            width: '100%',
                            accentColor: 'rgba(80,160,255,0.9)',
                            cursor: saving ? 'not-allowed' : 'pointer',
                        }}
                    />
                </div>
            ))}

            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%',
                    padding: '7px 0',
                    borderRadius: '5px',
                    border: 'none',
                    backgroundColor: saving ? 'rgba(255,255,255,0.1)' : 'rgba(80,160,255,0.85)',
                    color: saving ? 'rgba(255,255,255,0.4)' : '#fff',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    fontFamily: "'Pretendard', sans-serif",
                    transition: 'background-color 0.2s',
                }}
            >
                {saving ? '저장 중...' : '적용'}
            </button>
        </div>
    );
}
