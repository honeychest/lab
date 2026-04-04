// [AGENT] T4-ANALYSIS: 템플릿 관리 팝업 — 목록/불러오기/이름변경/삭제
import { useEffect, useRef, useState } from 'react';

const rowBtn = {
  background:   'var(--dark-btn-secondary)',
  border:       '1px solid var(--dark-input-border)',
  borderRadius: '4px',
  color:        'var(--dark-text-muted)',
  fontSize:     '11px',
  padding:      '3px 8px',
  cursor:       'pointer',
  fontFamily:   "'Pretendard', sans-serif",
};

function TemplateRow({ template, onLoad, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName]       = useState(template.name);
  const inputRef              = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commitRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== template.name) onRename(template.id, trimmed);
    setEditing(false);
  };

  return (
    <div style={{
      display:     'flex',
      alignItems:  'center',
      gap:         '8px',
      padding:     '8px 0',
      borderBottom: '1px solid var(--dark-input-border)',
    }}>
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(template.name); setEditing(false); } }}
          onBlur={commitRename}
          style={{
            flex:         1,
            background:   'var(--dark-input-bg)',
            border:       '1px solid var(--dark-border-subtle)',
            borderRadius: '4px',
            color:        'var(--dark-input-text)',
            fontSize:     '13px',
            padding:      '3px 8px',
            outline:      'none',
            fontFamily:   "'Pretendard', sans-serif",
          }}
        />
      ) : (
        <span style={{
          flex:       1,
          fontSize:   '13px',
          color:      'var(--dark-text-primary)',
          fontFamily: "'Pretendard', sans-serif",
        }}>
          {template.name}
        </span>
      )}
      <button onClick={() => { onLoad(template); }} style={rowBtn}>불러오기</button>
      <button onClick={() => setEditing(true)} style={rowBtn}>이름변경</button>
      <button onClick={() => onDelete(template.id)} style={{ ...rowBtn, color: 'var(--dark-error)', borderColor: 'rgba(255,59,92,0.3)' }}>삭제</button>
    </div>
  );
}

export default function TemplateManagerModal({ templates, onClose, onLoad, onRename, onDelete }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position:   'fixed',
        inset:      0,
        background: 'var(--dark-overlay-bg)',
        zIndex:     100,
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width:        '420px',
          maxHeight:    '60vh',
          background:   'var(--dark-modal-bg)',
          borderRadius: '10px',
          border:       '1px solid var(--dark-input-border)',
          display:      'flex',
          flexDirection: 'column',
          overflow:     'hidden',
        }}
      >
        {/* 헤더 */}
        <div style={{
          display:    'flex',
          alignItems: 'center',
          padding:    '14px 16px',
          borderBottom: '1px solid var(--dark-input-border)',
          flexShrink: 0,
        }}>
          <span style={{ flex: 1, fontSize: '1rem', color: 'var(--dark-input-text)', fontFamily: "'Pretendard', sans-serif", fontWeight: 600 }}>
            템플릿 관리
          </span>
          <button
            onClick={onClose}
            style={{
              background:  'transparent',
              border:      'none',
              color:       'var(--dark-text-muted)',
              fontSize:    '18px',
              cursor:      'pointer',
              lineHeight:  1,
              padding:     '0 2px',
              fontFamily:  "'Pretendard', sans-serif",
            }}
          >×</button>
        </div>

        {/* 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          {templates.length === 0 ? (
            <div style={{
              padding:    '24px 0',
              textAlign:  'center',
              fontSize:   '13px',
              color:      'var(--dark-text-muted)',
              fontFamily: "'Pretendard', sans-serif",
            }}>
              저장된 템플릿이 없습니다.
            </div>
          ) : (
            templates.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onLoad={(tmpl) => { onLoad(tmpl); onClose(); }}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
