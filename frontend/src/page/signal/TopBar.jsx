// [AGENT] Signal Dashboard TopBar — 심볼탭 + 시간 선택 + Funding Rate
// [AGENT] compact=true 시 모바일용 select 렌더
export default function TopBar({
    symbol,
    onSymbolChange,
    timeRange,
    onTimeRangeChange,
    fundingRate,
    timeRanges = [],
    compact = false,
}) {
    const getFundingStyle = () => {
        if (!fundingRate) return {};
        const abs = Math.abs(fundingRate);
        let borderColor = 'rgba(240,192,64,0.15)';
        let shouldBlink = false;

        if (abs > 0.05) {
            borderColor = 'rgba(240,192,64,0.5)';
            shouldBlink = true;
        } else if (abs > 0.01) {
            borderColor = 'rgba(240,192,64,0.3)';
        }

        return {
            border: `1px solid ${borderColor}`,
            animation: shouldBlink ? 'fundingBlink 4s ease-in-out infinite' : 'none',
        };
    };

    const selectStyle = {
        backgroundColor: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '6px',
        color: 'rgba(255,255,255,0.85)',
        fontSize: '12px',
        fontWeight: '600',
        padding: '4px 8px',
        cursor: 'pointer',
        outline: 'none',
        fontFamily: "'Pretendard', sans-serif",
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                height: '44px',
                backgroundColor: '#0a0a12',
                borderRadius: '10px',
                padding: '0 16px',
                fontFamily: "'Pretendard', sans-serif",
            }}
        >
            <style>{`
                @keyframes fundingBlink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>

            {compact ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                        value={symbol}
                        onChange={(e) => onSymbolChange(e.target.value)}
                        style={selectStyle}
                    >
                        {['BTCUSDT', 'ENAUSDT'].map((sym) => (
                            <option key={sym} value={sym} style={{ backgroundColor: '#0e0f18', color: 'rgba(255,255,255,0.85)' }}>{sym.replace('USDT', '')}</option>
                        ))}
                    </select>
                    <select
                        value={timeRange}
                        onChange={(e) => onTimeRangeChange(e.target.value)}
                        style={selectStyle}
                    >
                        {timeRanges.map(({ value, label }) => (
                            <option key={value} value={value} style={{ backgroundColor: '#0e0f18', color: 'rgba(255,255,255,0.85)' }}>{label}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['BTCUSDT', 'ENAUSDT'].map((sym) => (
                            <button
                                key={sym}
                                onClick={() => onSymbolChange(sym)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '4px',
                                    border: symbol === sym ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
                                    backgroundColor: symbol === sym ? 'rgba(255,255,255,0.08)' : 'transparent',
                                    color: symbol === sym ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {sym.replace('USDT', '')}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {timeRanges.map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => onTimeRangeChange(value)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '3px',
                                    border: timeRange === value ? '1px solid rgba(255,255,255,0.15)' : 'none',
                                    backgroundColor: timeRange === value ? 'rgba(255,255,255,0.06)' : 'transparent',
                                    color: timeRange === value ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div
                    style={{
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: fundingRate !== null ? (fundingRate >= 0 ? '#00e887' : '#ff3b5c') : 'transparent',
                        visibility: fundingRate !== null ? 'visible' : 'hidden',
                        ...getFundingStyle(),
                    }}
                >
                    {fundingRate !== null ? `${fundingRate >= 0 ? '+' : ''}${(fundingRate * 100).toFixed(3)}%` : '0.000%'}
                </div>
            </div>
        </div>
    );
}
