// [AGENT] T4-STEALTH: PatternStrip — StealthCaseViewer 호스팅 (헤더 제거, 템플릿 select는 TopBar로 일원화)
import { useState } from 'react';
import StealthCaseViewer from './stealth/StealthCaseViewer.jsx';

export default function PatternStrip({
  symbol,
  templateId,
  templateName,
  paletteLevel = 'MID',
}) {
  const [, setLoading] = useState(true);

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
