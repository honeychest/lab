// [AGENT] Signal Dashboard PatternStrip — 패턴 미니차트 (급등 봉 유사 패턴)
export default function PatternStrip({ patterns }) {
    const formatPriceChange = (change) => {
        const sign = change >= 0 ? '+' : '';
        return `${sign}${change.toFixed(2)}%`;
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    return (
        <div
            style={{
                height: '100%',
                backgroundColor: '#0e0f18',
                borderRadius: '10px',
                padding: '16px',
                border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                gap: '12px',
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.4)',
                    letterSpacing: '1px',
                    fontFamily: "'Pretendard', sans-serif",
                    marginRight: '8px',
                }}
            >
                SIMILAR PATTERNS
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '12px',
                    flex: 1,
                    overflowX: 'auto',
                }}
            >
                {patterns && patterns.length > 0 ? (
                    patterns.slice(0, 5).map((pattern, idx) => (
                        <div
                            key={idx}
                            style={{
                                minWidth: '180px',
                                maxWidth: '200px',
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                borderRadius: '6px',
                                padding: '10px',
                                border: '1px solid rgba(255,255,255,0.04)',
                                opacity: idx === 4 ? 0.45 : 1,
                            }}
                        >
                            <div
                                style={{
                                    width: '100%',
                                    height: '42px',
                                    backgroundColor: 'rgba(255,255,255,0.02)',
                                    borderRadius: '4px',
                                    marginBottom: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '10px',
                                    color: 'rgba(255,255,255,0.15)',
                                }}
                            >
                                Chart TBD
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: '13px',
                                        fontWeight: '700',
                                        color: pattern.priceChange >= 0 ? '#00e887' : '#ff3b5c',
                                        fontFamily: "'Pretendard', sans-serif",
                                    }}
                                >
                                    {formatPriceChange(pattern.priceChange)}
                                </span>
                                <span
                                    style={{
                                        fontSize: '9px',
                                        color: 'rgba(255,255,255,0.5)',
                                        fontFamily: "'Pretendard', sans-serif",
                                    }}
                                >
                                    {formatDate(pattern.candleTime)}
                                </span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.4)',
                        }}
                    >
                        유사 패턴 없음
                    </div>
                )}
            </div>
        </div>
    );
}
