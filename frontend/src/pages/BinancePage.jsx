// Purpose: Binance 대시보드 페이지 — 실시간 WebSocket 시세 및 지갑 잔고 표시
import { useEffect, useState } from 'react';
import axios from 'axios';
import Layout from '../layout/Layout.jsx';
import { useBinanceWebSocket } from '../hooks/useBinanceWebSocket.js';
import BinanceTicker from '../features/binance/components/BinanceTicker.jsx';
import BinanceWallet from '../features/binance/components/BinanceWallet.jsx';

const STATUS_CONFIG = {
    connected:    { color: '#2ecc71', dot: true,  text: 'LIVE' },
    connecting:   { color: '#f39c12', dot: false, text: '연결 중...' },
    disconnected: { color: '#e74c3c', dot: false, text: '연결 끊김' },
};

function BinancePage() {
    const { ticker, status } = useBinanceWebSocket();
    const [accountInfo, setAccountInfo]   = useState(null);
    const [walletLoading, setWalletLoading] = useState(true);
    const [walletError, setWalletError]   = useState(null);

    // 지갑 잔고는 REST로 1회 조회 (실시간 필요 없음)
    useEffect(() => {
        const fetchWallet = async () => {
            try {
                const res = await axios.get('/api/binance/account');
                setAccountInfo(res.data);
            } catch {
                setWalletError('잔고 조회에 실패했습니다.');
            } finally {
                setWalletLoading(false);
            }
        };
        fetchWallet();
    }, []);

    const { color, dot, text } = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;

    return (
        <Layout footerCenter={[]}>
            <div style={{
                minHeight: '100%', background: '#0a0f1e',
                padding: '32px', boxSizing: 'border-box'
            }}>
                <div style={{ maxWidth: '860px', margin: '0 auto' }}>

                    {/* 헤더 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <h1 style={{ color: '#F3BA2F', margin: 0, fontSize: '22px', fontWeight: '800', letterSpacing: '-0.5px' }}>
                            Binance Dashboard
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: color, display: 'inline-block',
                                boxShadow: dot ? `0 0 6px ${color}` : 'none'
                            }} />
                            <span style={{ color, fontSize: '12px', fontWeight: '700', letterSpacing: '1px' }}>{text}</span>
                        </div>
                    </div>

                    {/* 실시간 시세 */}
                    <div style={{
                        background: '#0f172a', border: '1px solid #1e293b',
                        borderRadius: '16px', padding: '24px', marginBottom: '20px'
                    }}>
                        <BinanceTicker ticker={ticker} />
                    </div>

                    {/* 지갑 잔고 */}
                    <div style={{
                        background: '#0f172a', border: '1px solid #1e293b',
                        borderRadius: '16px', padding: '24px'
                    }}>
                        <BinanceWallet
                            accountInfo={accountInfo}
                            loading={walletLoading}
                            error={walletError}
                        />
                    </div>

                </div>
            </div>
        </Layout>
    );
}

export default BinancePage;
