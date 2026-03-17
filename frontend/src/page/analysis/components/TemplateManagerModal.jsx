// [AGENT] T4-ANALYSIS: 템플릿 관리 팝업 — 목록/불러오기/이름변경/삭제
import { useEffect, useRef, useState } from 'react';

const rowBtn = {
  background:   'rgba(255,255,255,0.06)',
  border:       '1px solid rgba(255,255,255,0.1)',
  borderRadius: '4px',
  color:        'rgba(255,255,255,0.7)',
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
      borderBottom: '1px solid rgba(255,255,255,0.05)',
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
            background:   'rgba(255,255,255,0.08)',
            border:       '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            color:        'rgba(255,255,255,0.9)',
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
          color:      'rgba(255,255,255,0.85)',
          fontFamily: "'Pretendard', sans-serif",
        }}>
          {template.name}
        </span>
      )}
      <button onClick={() => { onLoad(template); }} style={rowBtn}>불러오기</button>
      <button onClick={() => setEditing(true)} style={rowBtn}>이름변경</button>
      <button onClick={() => onDelete(template.id)} style={{ ...rowBtn, color: '#ff3b5c', borderColor: 'rgba(255,59,92,0.3)' }}>삭제</button>
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
        background: 'rgba(0,0,0,0.5)',
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
          background:   '#12131e',
          borderRadius: '10px',
          border:       '1px solid rgba(255,255,255,0.1)',
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
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <span style={{ flex: 1, fontSize: '1rem', color: 'rgba(255,255,255,0.9)', fontFamily: "'Pretendard', sans-serif", fontWeight: 600 }}>
            템플릿 관리
          </span>
          <button
            onClick={onClose}
            style={{
              background:  'transparent',
              border:      'none',
              color:       'rgba(255,255,255,0.5)',
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
              color:      'rgba(255,255,255,0.3)',
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
