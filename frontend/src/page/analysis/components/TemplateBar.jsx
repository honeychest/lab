// [AGENT] T4-ANALYSIS: 템플릿 바 — 드롭다운 불러오기 + [관리] 버튼 + 저장 입력 플로우
import { useRef, useEffect } from 'react';

const sel = {
  flex:         1,
  background:   'rgba(255,255,255,0.06)',
  border:       '1px solid rgba(255,255,255,0.12)',
  borderRadius: '4px',
  color:        'rgba(255,255,255,0.8)',
  fontSize:     '12px',
  padding:      '5px 8px',
  cursor:       'pointer',
  outline:      'none',
  fontFamily:   "'Pretendard', sans-serif",
};

const btn = (primary = false) => ({
  background:   primary ? 'rgba(80,160,255,0.85)' : 'rgba(255,255,255,0.06)',
  border:       primary ? 'none' : '1px solid rgba(255,255,255,0.12)',
  borderRadius: '4px',
  color:        'rgba(255,255,255,0.9)',
  fontSize:     '12px',
  padding:      '5px 12px',
  cursor:       'pointer',
  fontFamily:   "'Pretendard', sans-serif",
  flexShrink:   0,
});

export default function TemplateBar({
  templates,
  selectedId,
  onSelect,
  onManage,
  saveState,
  onSaveClick,
  onSaveConfirm,
  onSaveCancel,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (saveState === 'input' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [saveState]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  onSaveConfirm(e.target.value.trim());
    if (e.key === 'Escape') onSaveCancel();
  };

  if (saveState === 'input' || saveState === 'saving') {
    const current = templates.find((t) => t.id === selectedId);
    const defaultName = current?.name ?? '';

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: '0.81rem', color: 'rgba(255,255,255,0.6)', fontFamily: "'Pretendard', sans-serif" }}>
            템플릿 이름을 확인해주세요.
          </span>
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', fontFamily: "'Pretendard', sans-serif" }}>
            같은 이름으로 저장하면 기존 템플릿이 덮어쓰기 되고, 다른 이름이면 새 템플릿이 생성됩니다.
          </span>
        </div>
        <input
          ref={inputRef}
          type="text"
          defaultValue={defaultName}
          placeholder="템플릿 이름 입력 후 Enter"
          disabled={saveState === 'saving'}
          onKeyDown={handleKeyDown}
          style={{
            flex:         1.2,
            background:   'rgba(255,255,255,0.06)',
            border:       '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            color:        'rgba(255,255,255,0.9)',
            fontSize:     '12px',
            padding:      '5px 10px',
            outline:      'none',
            fontFamily:   "'Pretendard', sans-serif",
          }}
        />
        {saveState === 'saving' ? (
          <div style={{
            width:        '16px',
            height:       '16px',
            border:       '2px solid rgba(255,255,255,0.1)',
            borderTop:    '2px solid rgba(80,160,255,0.8)',
            borderRadius: '50%',
            animation:    'spin 0.8s linear infinite',
            flexShrink:   0,
          }} />
        ) : (
          <button onClick={onSaveCancel} style={btn(false)}>취소</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{
        fontSize:   '0.81rem',
        color:      'rgba(255,255,255,0.4)',
        flexShrink: 0,
        fontFamily: "'Pretendard', sans-serif",
      }}>템플릿</span>
      <select
        value={selectedId ?? ''}
        onChange={(e) => {
          const t = templates.find((t) => String(t.id) === e.target.value);
          if (t) onSelect(t);
        }}
        style={sel}
      >
        <option value="">-- 선택 --</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <button onClick={onSaveClick} style={btn(true)}>저장</button>
      <button onClick={onManage} style={btn(false)}>관리</button>
    </div>
  );
}
