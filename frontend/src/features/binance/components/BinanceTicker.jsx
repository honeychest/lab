// Purpose: 바이낸스 실시간 시세 표시 컴포넌트 — Binance ticker 전체 필드 UI 렌더링
import React from 'react';

// 숫자 포맷 (소수점 자릿수 지정)
const fmt = (val, decimals = 2) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '---';
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
};

// 거래대금 단위 자동 변환 (M / B)
const fmtQuote = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '---';
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000)     return `$${(num / 1_000_000).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
};

// 타임스탬프 → 시:분:초
const fmtTime = (ts) => {
    if (!ts) return '---';
    return new Date(ts).toLocaleTimeString('ko-KR');
};

function InfoBox({ label, value, sub, valueColor }) {
    return (
        <div style={{
            background: '#1e293b', borderRadius: '8px', padding: '14px 10px',
            textAlign: 'center', border: '1px solid #334155'
        }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '5px' }}>{label}</div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: valueColor || '#f1f5f9' }}>{value}</div>
            {sub && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>{sub}</div>}
        </div>
    );
}

function BinanceTicker({ ticker }) {
    if (!ticker) return (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
            시세 데이터를 수신하는 중...
        </div>
    );

    const priceChange = parseFloat(ticker.p);
    const isUp = priceChange >= 0;
    const changeColor = isUp ? '#2ecc71' : '#e74c3c';
    const arrow = isUp ? '▲' : '▼';

    return (
        <div>
            {/* 현재가 메인 카드 */}
            <div style={{
                background: '#020617', border: '1px solid #1e293b', borderRadius: '12px',
                padding: '28px', marginBottom: '16px', textAlign: 'center'
            }}>
                <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px', letterSpacing: '2px' }}>
                    BTC / USDT
                </div>
                <div style={{ fontSize: '46px', fontWeight: '800', color: '#f1f5f9', marginBottom: '10px' }}>
                    ${fmt(ticker.c)}
                </div>
                <div style={{ fontSize: '20px', color: changeColor, marginBottom: '8px' }}>
                    {arrow} {isUp ? '+' : ''}{fmt(ticker.p)} ({isUp ? '+' : ''}{fmt(ticker.P)}%)
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                    마지막 업데이트: {fmtTime(ticker.E)}
                </div>
            </div>

            {/* 가격 정보 */}
            <div style={{ marginBottom: '6px', fontSize: '11px', color: '#475569', paddingLeft: '2px' }}>가격 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                <InfoBox label="24h 시가"     value={`$${fmt(ticker.o)}`} />
                <InfoBox label="전일 종가"    value={`$${fmt(ticker.x)}`} />
                <InfoBox label="가중 평균가"  value={`$${fmt(ticker.w)}`} />
                <InfoBox label="24h 고가"     value={`$${fmt(ticker.h)}`} valueColor="#2ecc71" />
                <InfoBox label="24h 저가"     value={`$${fmt(ticker.l)}`} valueColor="#e74c3c" />
                <InfoBox label="최근 체결량"  value={`${fmt(ticker.Q, 5)} BTC`} />
            </div>

            {/* 호가 정보 */}
            <div style={{ marginBottom: '6px', fontSize: '11px', color: '#475569', paddingLeft: '2px' }}>호가 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                <InfoBox label="매수 호가 (Bid)" value={`$${fmt(ticker.b)}`} sub={`수량: ${fmt(ticker.B, 4)} BTC`} valueColor="#2ecc71" />
                <InfoBox label="매도 호가 (Ask)" value={`$${fmt(ticker.a)}`} sub={`수량: ${fmt(ticker.A, 4)} BTC`} valueColor="#e74c3c" />
            </div>

            {/* 거래량 정보 */}
            <div style={{ marginBottom: '6px', fontSize: '11px', color: '#475569', paddingLeft: '2px' }}>거래량 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <InfoBox label="24h 거래량"   value={`${fmt(ticker.v, 2)} BTC`} />
                <InfoBox label="24h 거래대금" value={fmtQuote(ticker.q)} />
                <InfoBox label="총 거래 횟수" value={`${Number(ticker.n).toLocaleString()}건`} />
            </div>
        </div>
    );
}

export default BinanceTicker;
