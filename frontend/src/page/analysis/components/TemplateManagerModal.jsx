// [AGENT] T4-ANALYSIS: 템플릿 관리 팝업 — 목록/불러오기/이름변경/삭제
import { useEffect, useRef, useState } from 'react';

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
    <div className="analysis-modal-row">
      {editing ? (
        <input
          ref={inputRef}
          className="analysis-input analysis-input--focus-strong analysis-modal-row__edit"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setName(template.name); setEditing(false); } }}
          onBlur={commitRename}
        />
      ) : (
        <span className="analysis-modal-row__name">{template.name}</span>
      )}
      <button onClick={() => { onLoad(template); }} className="analysis-modal-row__btn">불러오기</button>
      <button onClick={() => setEditing(true)} className="analysis-modal-row__btn">이름변경</button>
      <button onClick={() => onDelete(template.id)} className="analysis-modal-row__btn analysis-modal-row__btn--delete">삭제</button>
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
      className="analysis-modal-backdrop analysis-modal-backdrop--manager"
    >
      <div onClick={(e) => e.stopPropagation()} className="analysis-modal">
        {/* 헤더 */}
        <div className="analysis-modal__header">
          <span className="analysis-modal__title">템플릿 관리</span>
          <button
            onClick={onClose}
            className="analysis-btn--icon analysis-modal__close"
          >×</button>
        </div>

        {/* 목록 */}
        <div className="analysis-modal__body">
          {templates.length === 0 ? (
            <div className="analysis-modal__empty">저장된 템플릿이 없습니다.</div>
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
