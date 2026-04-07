/**
 * /admin/test Auth 도메인 전용 API 래퍼.
 * URL은 이 파일에만 둔다. 다른 화면에서는 import 하지 않는다.
 */
import apiClient from '@/api/apiClient.js';

const PATH_LOGIN = '/api/auth/login';
const PATH_REFRESH = '/api/auth/refresh';
const PATH_LOGOUT = '/api/auth/logout';
/** Admin 전용: 구 배포에 /api/auth/invalidate-refresh 가 없어도 동작 */
const PATH_INVALIDATE_REFRESH_REDIS = '/api/admin/test/auth/invalidate-refresh-redis';
const PATH_DEBUG_COOKIE_INFO = '/api/admin/test/auth/debug/cookie-info';
const PATH_DEBUG_ACCESS_TOKEN = '/api/admin/test/auth/debug/access-token';
const PATH_DEBUG_REFRESH_TOKEN = '/api/admin/test/auth/debug/refresh-token';
const PATH_DEBUG_ACCESS_FROM_COOKIE = '/api/admin/test/auth/debug/access-token-from-cookie';
const PATH_DEBUG_REFRESH_FROM_COOKIE = '/api/admin/test/auth/debug/refresh-token-from-cookie';

/**
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function login(credentials) {
    return apiClient.post(PATH_LOGIN, credentials);
}

/**
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function refreshAccessToken() {
    return apiClient.post(PATH_REFRESH);
}

/**
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function logout() {
    return apiClient.post(PATH_LOGOUT);
}

/**
 * Redis의 refresh 매핑만 삭제. httpOnly refresh 쿠키는 유지.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function invalidateRefreshRedisOnly() {
    return apiClient.post(PATH_INVALIDATE_REFRESH_REDIS);
}

/**
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function fetchCookieDebug() {
    return apiClient.get(PATH_DEBUG_COOKIE_INFO);
}

/**
 * @param {string} accessToken
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function debugAccessToken(accessToken) {
    return apiClient.post(PATH_DEBUG_ACCESS_TOKEN, { accessToken });
}

/**
 * @param {string} refreshToken
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function debugRefreshToken(refreshToken) {
    return apiClient.post(PATH_DEBUG_REFRESH_TOKEN, { refreshToken });
}

/**
 * httpOnly access 쿠키로 디버그 (본문에 토큰 없음).
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function debugAccessTokenFromCookie() {
    return apiClient.post(PATH_DEBUG_ACCESS_FROM_COOKIE);
}

/**
 * httpOnly refresh 쿠키로 디버그.
 * @returns {Promise<import('axios').AxiosResponse>}
 */
export function debugRefreshTokenFromCookie() {
    return apiClient.post(PATH_DEBUG_REFRESH_FROM_COOKIE);
}

/**
 * 동일 출처로 refresh 호출하되 브라우저가 쿠키를 보내지 않음 (부정 테스트).
 * @returns {Promise<{ status: number, data: unknown }>}
 */
export async function refreshAccessTokenOmitCredentials() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(`${origin}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'omit',
    });
    let data = null;
    const ct = res.headers.get('content-type');
    if (ct && ct.includes('application/json')) {
        try {
            data = await res.json();
        } catch {
            data = null;
        }
    } else {
        const text = await res.text();
        data = text || null;
    }
    return { status: res.status, data };
}
