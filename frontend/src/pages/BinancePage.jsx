// Purpose: Binance 페이지 - 실시간 시세 및 잔고 확인
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Layout from '../layout/Layout.jsx';

function BinancePage() {
    const [btcPrice, setBtcPrice] = useState(null);
    const [accountInfo, setAccountInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    // 데이터를 가져오는 함수
    const fetchData = async () => {
        try {
            // 1. 비트코인 시세 가져오기
            const priceRes = await axios.get('/api/binance/price');
            setBtcPrice(priceRes.data.price);

            // 2. 내 계정 잔고 가져오기
            const accountRes = await axios.get('/api/binance/account');
            setAccountInfo(accountRes.data);

            setLoading(false);
        } catch (error) {
            console.error("데이터 로드 실패:", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // 10초마다 데이터 갱신
        const timer = setInterval(fetchData, 10000);
        return () => clearInterval(timer);
    }, []);

    return (
        <Layout footerCenter={[]}>
            <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
                <h1 style={{ color: '#F3BA2F', textAlign: 'center' }}>Binance Dashboard</h1>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '50px' }}>데이터를 불러오는 중...</div>
                ) : (
                    <>
                        {/* 시세 섹션 */}
                        <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '12px', marginBottom: '20px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ margin: '0 0 10px 0', color: '#666' }}>BTC / USDT</h3>
                            <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2ecc71' }}>
                                ${btcPrice ? parseFloat(btcPrice).toLocaleString() : '---'}
                            </div>
                        </div>

                        {/* 잔고 섹션 */}
                        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #eee' }}>
                            <h3 style={{ borderBottom: '2px solid #F3BA2F', paddingBottom: '10px' }}>내 지갑 잔고</h3>
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                                <thead>
                                <tr style={{ textAlign: 'left', color: '#888' }}>
                                    <th style={{ padding: '10px 0' }}>자산(Asset)</th>
                                    <th>보유 수량(Free)</th>
                                </tr>
                                </thead>
                                <tbody>
                                {accountInfo?.balances
                                    ?.filter(balance => parseFloat(balance.free) > 0) // 잔고가 있는 것만 표시
                                    .map((balance, index) => (
                                        <tr key={index} style={{ borderBottom: '1px solid #f1f1f1' }}>
                                            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>{balance.asset}</td>
                                            <td>{parseFloat(balance.free).toFixed(8)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ textAlign: 'center', marginTop: '20px' }}>
                            <button
                                onClick={fetchData}
                                style={{ padding: '10px 20px', backgroundColor: '#F3BA2F', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                지금 새로고침
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
}

export default BinancePage;