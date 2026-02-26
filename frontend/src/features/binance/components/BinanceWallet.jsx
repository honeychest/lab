// Purpose: 바이낸스 지갑 잔고 표시 컴포넌트 — 보유 자산 목록 렌더링
import React from 'react';

function BinanceWallet({ accountInfo, loading, error }) {
    if (loading) return (
        <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>잔고 불러오는 중...</div>
    );
    if (error) return (
        <div style={{ textAlign: 'center', padding: '30px', color: '#e74c3c' }}>{error}</div>
    );

    const balances = accountInfo?.balances?.filter((b) => {
        const val = parseFloat(b.free);
        return !isNaN(val) && val > 0;
    }) ?? [];

    return (
        <div>
            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '12px' }}>지갑 잔고</div>
            <h3 style={{
                color: '#F3BA2F', margin: '0 0 16px 0',
                borderBottom: '1px solid #1e293b', paddingBottom: '12px', fontSize: '16px'
            }}>
                내 지갑 잔고
            </h3>
            {balances.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>보유 자산 없음</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ color: '#64748b', fontSize: '11px' }}>
                            <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: '400' }}>자산 (Asset)</th>
                            <th style={{ textAlign: 'right', fontWeight: '400' }}>보유 수량 (Free)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {balances.map((b) => (
                            <tr key={b.asset} style={{ borderTop: '1px solid #1e293b' }}>
                                <td style={{ padding: '12px 0', fontWeight: '700', color: '#f1f5f9' }}>{b.asset}</td>
                                <td style={{ textAlign: 'right', color: '#94a3b8', fontFamily: 'monospace' }}>
                                    {parseFloat(b.free).toFixed(8)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

export default BinanceWallet;
