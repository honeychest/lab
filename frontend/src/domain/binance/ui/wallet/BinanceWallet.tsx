// [AGENT] 바이낸스 지갑 잔고 표시 — REST API 잔고 UI, props: accountInfo/loading/error
// 연관: BinancePage.jsx
// Purpose: 바이낸스 지갑 잔고 표시 컴포넌트 — REST API로 조회한 계좌 잔고 UI

/**
 * ─────────────────────────────────────────────────────────────────
 *  동작 원리
 * ─────────────────────────────────────────────────────────────────
 *  - 이 컴포넌트 자체는 데이터를 직접 조회하지 않음.
 *  - BinancePage.jsx에서 axios.get('/api/binance/account') 로 1회 조회한 뒤
 *    accountInfo, loading, error 를 props로 전달해줌.
 *  - jQuery에서 비유:
 *    부모가 $.ajax로 데이터를 받아서 renderWallet(data) 함수를 호출하는 것처럼,
 *    부모(BinancePage)가 axios로 데이터를 받아서 <BinanceWallet accountInfo={data} /> 렌더링.
 *
 *  REST vs WebSocket:
 *    지갑 잔고는 실시간으로 변하지 않으므로 WebSocket이 아닌 REST API 1회 호출 사용.
 *    바이낸스 API Rate Limit 절약 목적.
 * ─────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────
//  타입 정의
// ─────────────────────────────────────────────────────────────────

/**
 * 바이낸스 계좌의 개별 코인 잔고 정보.
 *
 * 바이낸스 GET /api/v3/account API 응답의 balances 배열 원소 구조.
 * 모든 수량 값은 문자열로 오므로 parseFloat() 변환 필요.
 */
export interface WalletBalance {
    /** 코인 심볼. 예: "BTC", "ETH", "USDT", "BNB" */
    asset: string;

    /**
     * 사용 가능한 수량 (Free Balance).
     * 주문에 묶이지 않고 지금 당장 거래/출금 가능한 수량.
     * 문자열로 오며, 예: "0.00250000" (= 0.0025 BTC)
     */
    free: string;

    /**
     * 주문에 묶인 수량 (Locked Balance).
     * 현재 오픈 주문(미체결 주문)에 할당되어 있는 수량.
     * free + locked = 총 보유 수량.
     * 문자열로 오며, 예: "0.00010000"
     */
    locked: string;
}

/**
 * GET /api/binance/account 응답 전체 구조.
 *
 * 실제 바이낸스 API 응답을 Spring Boot BinanceService가 그대로 전달.
 * 바이낸스 공식 응답에는 더 많은 필드가 있으나 화면 표시에 필요한 것만 선언.
 */
export interface AccountInfo {
    /**
     * 계좌 보유 코인 목록.
     * 바이낸스 계좌에 등록된 모든 코인이 포함되며,
     * free와 locked 모두 "0.00000000" 인 코인도 포함됨.
     * 유의미한 잔고만 표시하려면 클라이언트에서 필터링 필요.
     */
    balances: WalletBalance[];
}

/**
 * BinanceWallet 컴포넌트의 Props.
 *
 * 세 가지 상태를 부모로부터 받아 각각 다른 UI를 표시:
 *   loading=true  → 로딩 스피너/텍스트
 *   error≠null    → 에러 메시지
 *   accountInfo≠null → 잔고 목록
 */
interface BinanceWalletProps {
    /** 계좌 정보. 로딩 완료 전 또는 에러 시에는 null */
    accountInfo: AccountInfo | null;
    /** REST API 호출 진행 중 여부 */
    loading: boolean;
    /** 에러 발생 시 에러 메시지 문자열. 정상 시 null */
    error: string | null;
}

// ─────────────────────────────────────────────────────────────────
//  메인 컴포넌트
// ─────────────────────────────────────────────────────────────────

/**
 * BinanceWallet 컴포넌트
 *
 * BinancePage에서:
 *   <BinanceWallet accountInfo={accountInfo} loading={walletLoading} error={walletError} />
 * 형태로 사용.
 */
function BinanceWallet({ accountInfo, loading, error }: BinanceWalletProps) {

    // ── 로딩 상태 ────────────────────────────────────────────────
    // jQuery에서 $.ajax 호출 전 $('#spinner').show() 하는 것과 유사
    if (loading) {
        return (
            <div style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '20px 0' }}>
                잔고 조회 중...
            </div>
        );
    }

    // ── 에러 상태 ────────────────────────────────────────────────
    // jQuery에서 $.ajax error 콜백에서 $('#error').text(msg).show() 하는 것과 유사
    if (error) {
        return (
            <div style={{ color: '#e74c3c', fontSize: '14px', padding: '20px 0' }}>
                ⚠ {error}
            </div>
        );
    }

    // ── 데이터 없음 상태 ─────────────────────────────────────────
    if (!accountInfo) {
        return (
            <div style={{ color: '#64748b', fontSize: '14px', padding: '20px 0' }}>
                계좌 정보 없음
            </div>
        );
    }

    // ── 유의미한 잔고 필터링 ─────────────────────────────────────
    /**
     * 바이낸스 balances 배열에는 잔고 0인 코인도 모두 포함됨 (50+ 개).
     * free > 0 또는 locked > 0 인 것만 표시.
     *
     * Array.filter():
     *   jQuery에서 $.grep(arr, fn) 또는 arr.filter(fn) 과 동일.
     *   조건 함수가 true를 반환하는 원소만 새 배열로 반환.
     *
     * parseFloat(b.free) > 0 || parseFloat(b.locked) > 0:
     *   free 또는 locked 중 하나라도 0보다 크면 표시.
     */
    const nonZeroBalances = accountInfo.balances.filter(
        (b: WalletBalance) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    );

    return (
        <div>
            {/* ── 섹션 제목 ──────────────────────────────────────── */}
            <h2 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: '700', letterSpacing: '1px', margin: '0 0 16px 0' }}>
                지갑 잔고 · {nonZeroBalances.length}개 코인
            </h2>

            {/* ── 잔고 없음 안내 ──────────────────────────────────── */}
            {nonZeroBalances.length === 0 && (
                <div style={{ color: '#64748b', fontSize: '14px' }}>보유 중인 코인이 없습니다.</div>
            )}

            {/* ── 잔고 목록 테이블 ────────────────────────────────── */}
            {/*
              React에서 배열을 UI로 변환:
                nonZeroBalances.map((b, i) => <JSX>)
                jQuery에서 $.each(arr, fn) 또는 arr.forEach(fn) 으로 반복하면서
                HTML 문자열을 만들어 innerHTML에 넣는 것과 유사.

              key prop:
                React가 배열 각 항목을 구분하는 고유 식별자.
                key가 없으면 React가 어떤 항목이 변경됐는지 추적 불가.
                여기서는 코인 심볼(asset)이 고유하므로 key로 사용.
                jQuery에서 $(elem).data('id', ...) 로 식별자를 붙이는 것과 유사한 개념.
            */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {nonZeroBalances.map((b: WalletBalance) => {

                    // free, locked 수량을 8자리 소수점으로 포맷
                    // parseFloat로 문자열 → 숫자 변환 후 toFixed(8)로 8자리 고정
                    // 비트코인은 소수점 8자리(1 사토시 = 0.00000001 BTC)까지 표현 가능
                    const freeAmt  = parseFloat(b.free).toFixed(8);
                    const lockAmt  = parseFloat(b.locked).toFixed(8);
                    const hasLocked = parseFloat(b.locked) > 0;

                    return (
                        <div key={b.asset} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            background: '#1e293b',
                            borderRadius: '10px',
                            flexWrap: 'wrap',
                            gap: '8px',
                        }}>
                            {/* 코인 심볼 (예: BTC, USDT) */}
                            <span style={{ color: '#F3BA2F', fontWeight: '800', fontSize: '14px', minWidth: '60px' }}>
                                {b.asset}
                            </span>

                            {/* 잔고 상세 */}
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {/* 사용 가능 잔고 */}
                                <div>
                                    <span style={{ color: '#64748b', fontSize: '11px' }}>가용 </span>
                                    <span style={{ color: '#e2e8f0', fontSize: '13px', fontFamily: 'monospace' }}>
                                        {freeAmt}
                                    </span>
                                </div>

                                {/* 주문 묶인 수량: locked > 0 인 경우만 표시
                                    오픈 주문이 없으면 locked = 0 이므로 숨김 */}
                                {hasLocked && (
                                    <div>
                                        <span style={{ color: '#64748b', fontSize: '11px' }}>주문중 </span>
                                        <span style={{ color: '#f39c12', fontSize: '13px', fontFamily: 'monospace' }}>
                                            {lockAmt}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default BinanceWallet;
