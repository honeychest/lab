/**
 * Admin /auth 테스트 전용 — auth 외 API가 AUTH_LOGIN_FAILED로 오인되지 않는지 수동 확인용.
 */
import apiClient from '@/api/apiClient.js';

const noThrowStatus = { validateStatus: () => true };

/**
 * Contact SSE 구독 엔드포인트 — 잘못된 guestToken 시 IllegalArgumentException.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function fetchSupportSseBadGuestToken() {
    return apiClient.get('/api/support/reply/sse', {
        params: { guestToken: 'not-a-valid-uuid' },
        ...noThrowStatus,
    });
}

/**
 * Binance trades — 잘못된 날짜 파라미터 시 400 + error (auth 포맷이 아니어야 함).
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function fetchBinanceTradesBadDate() {
    return apiClient.get('/api/binance/trades', {
        params: { from: '2024/01/15' },
        ...noThrowStatus,
    });
}
