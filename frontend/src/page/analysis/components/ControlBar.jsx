// [AGENT] T4-ANALYSIS: 컨트롤 바 — 심볼 선택 + 봉 단위(1m/5m) + 날짜 범위 + 불러오기 버튼
export default function ControlBar({
  symbol,
  onSymbolChange,
  timeframe,
  onTimeframeChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onLoad,
  loading,
}) {
  const symBtn = (s) => ({
    padding:         '5px 14px',
    borderRadius:    '4px',
    border:          symbol === s ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
    backgroundColor: symbol === s ? 'rgba(255,255,255,0.08)' : 'transparent',
    color:           symbol === s ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)',
    fontSize:        '12px',
    fontWeight:      600,
    cursor:          loading ? 'not-allowed' : 'pointer',
    opacity:         loading ? 0.5 : 1,
    fontFamily:      "'Pretendard', sans-serif",
  });

  const dateInp = {
    background:   'rgba(255,255,255,0.06)',
    border:       '1px solid rgba(255,255,255,0.12)',
    borderRadius: '4px',
    color:        'rgba(255,255,255,0.8)',
    fontSize:     '12px',
    padding:      '4px 8px',
    outline:      'none',
    fontFamily:   "'Pretendard', sans-serif",
    cursor:       loading ? 'not-allowed' : 'auto',
    opacity:      loading ? 0.5 : 1,
  };

  return (
    <div style={{
      height:          '44px',
      backgroundColor: '#0a0a12',
      borderRadius:    '10px',
      display:         'flex',
      alignItems:      'center',
      gap:             '12px',
      padding:         '0 16px',
      flexShrink:      0,
      fontFamily:      "'Pretendard', sans-serif",
    }}>
      {/* 심볼 */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {['BTC', 'ENA'].map((s) => (
          <button key={s} onClick={() => !loading && onSymbolChange(s)} style={symBtn(s)}>{s}</button>
        ))}
      </div>

      {/* 봉 단위 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {['1m', '5m'].map((tf) => (
          <button
            key={tf}
            onClick={() => !loading && onTimeframeChange(tf)}
            style={{
              padding:         '5px 10px',
              borderRadius:    '4px',
              border:          timeframe === tf ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
              backgroundColor: timeframe === tf ? 'rgba(255,255,255,0.08)' : 'transparent',
              color:           timeframe === tf ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)',
              fontSize:        '12px',
              fontWeight:      600,
              cursor:          loading ? 'not-allowed' : 'pointer',
              opacity:         loading ? 0.5 : 1,
              fontFamily:      "'Pretendard', sans-serif",
            }}
          >{tf}</button>
        ))}
      </div>

      {/* 날짜 범위 */}
        <span style={{ fontSize: '0.81rem', color: 'rgba(255,255,255,0.3)' }}>범위</span>
      <input
        type="date"
        value={startDate}
        disabled={loading}
        onChange={(e) => onStartDateChange(e.target.value)}
        style={dateInp}
      />
        <span style={{ fontSize: '0.81rem', color: 'rgba(255,255,255,0.3)' }}>~</span>
      <input
        type="date"
        value={endDate}
        disabled={loading}
        onChange={(e) => onEndDateChange(e.target.value)}
        style={dateInp}
      />

      {/* 불러오기 */}
      <button
        onClick={onLoad}
        disabled={loading}
        style={{
          padding:      '5px 14px',
          background:   'rgba(80,160,255,0.85)',
          border:       'none',
          borderRadius: '4px',
          color:        '#fff',
          fontSize:     '12px',
          fontWeight:   600,
          cursor:       loading ? 'not-allowed' : 'pointer',
          opacity:      loading ? 0.5 : 1,
          fontFamily:   "'Pretendard', sans-serif",
          flexShrink:   0,
        }}
      >불러오기</button>
    </div>
  );
}
