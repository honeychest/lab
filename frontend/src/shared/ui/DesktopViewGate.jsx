export function DesktopViewGate({
  message = '데스크톱 화면에서만 사용할 수 있습니다.',
  actionLabel = 'PC화면으로 보기',
  onAction,
}) {
  return (
    <div style={{
      flex:           1,
      minHeight:      0,
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      color:          'var(--dark-text-primary)',
      fontFamily:     "'Pretendard', sans-serif",
      fontSize:       '0.94rem',
      gap:            '12px',
      background:     'var(--dark-bg)',
      padding:        '16px',
      textAlign:      'center',
      boxSizing:      'border-box',
    }}>
      <div>{message}</div>
      <button
        type="button"
        onClick={onAction}
        style={{
          border:       '1px solid var(--dark-input-border)',
          background:   'var(--dark-btn-secondary)',
          color:        'var(--dark-text-primary)',
          borderRadius: '10px',
          padding:      '10px 12px',
          fontWeight:   900,
          cursor:       'pointer',
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function DesktopViewResetButton({
  label = '모바일로 보기',
  onClick,
  fixed = false,
}) {
  return (
    <div style={{
      display:        'flex',
      justifyContent: 'flex-end',
      gap:            '8px',
      ...(fixed ? {
        position: 'fixed',
        right:    '12px',
        bottom:   '12px',
        zIndex:   200,
      } : null),
    }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          border:       '1px solid var(--dark-input-border)',
          background:   'var(--dark-btn-secondary)',
          color:        'var(--dark-text-primary)',
          borderRadius: '10px',
          padding:      '8px 10px',
          fontWeight:   900,
          cursor:       'pointer',
        }}
      >
        {label}
      </button>
    </div>
  );
}
