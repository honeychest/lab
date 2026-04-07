// [AGENT] T4-STEALTH: PatternStrip — 헤더(선택된 분석 템플릿 이름) + StealthCaseViewer 호스팅 (분석 템플릿 기반)
import { useState } from 'react';
import StealthCaseViewer from './stealth/StealthCaseViewer.jsx';

export default function PatternStrip({
  symbol,
  templateId,
  templateName,
  paletteLevel = 'MID',
  templates = [],
  onTemplateChange,
}) {
  const [loading, setLoading] = useState(true);

  return (
    <div style={{
      height:          '100%',
      display:         'flex',
      flexDirection:   'column',
      backgroundColor: 'var(--black-panel-bg)',
      borderRadius:    '10px',
      border:          '1px solid var(--black-border)',
      overflow:        'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        height:      '48px',
        flexShrink:  0,
        display:     'flex',
        alignItems:  'center',
        gap:         '8px',
        padding:     '0 16px',
      }}>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading && (
            <>
              <style>{`
                @keyframes stealthHeaderSpin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
              <span
                style={{
                  width:        14,
                  height:       14,
                  borderRadius: '50%',
                  border:       '2px solid var(--black-border-strong)',
                  borderTop:    '2px solid var(--black-long)',
                  animation:    'stealthHeaderSpin 0.9s linear infinite',
                }}
              />
            </>
          )}
          {(!templateName || !templateId) && (
            <span
              style={{
                fontSize:   '0.81rem',
                color:      'var(--black-text-muted)',
                fontFamily: "'Pretendard', sans-serif",
              }}
            >
              분석 템플릿을 선택해주세요
            </span>
          )}
          {templates.length > 0 && (
            <select
              value={templateId ?? ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                if (id != null && onTemplateChange) onTemplateChange(id);
              }}
              style={{
                backgroundColor: 'var(--black-border)',
                border:          '1px solid var(--black-border-strong)',
                borderRadius:    '6px',
                color:           'var(--black-text-primary)',
                fontSize:        '0.81rem',
                padding:         '4px 8px',
                cursor:          'pointer',
                outline:         'none',
                fontFamily:      "'Pretendard', sans-serif",
                maxWidth:        200,
              }}
            >
              <option value="" disabled>템플릿 선택</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* StealthCaseViewer */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <StealthCaseViewer
          symbol={symbol}
          templateId={templateId}
          templateName={templateName}
          paletteLevel={paletteLevel}
          onLoadingChange={setLoading}
        />
      </div>
    </div>
  );
}
