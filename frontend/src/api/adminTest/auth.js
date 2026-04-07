/**
 * /admin/test Auth 도메인 전용 API 래퍼.
 * URL은 이 파일에만 둔다. 다른 화면에서는 import 하지 않는다.
 */
import apiClient from '@/api/apiClient.js';

const PATH_LOGIN          = '/api/auth/login';
const PATH_REFRESH        = '/api/auth/refresh';
const PATH_LOGOUT         = '/api/auth/logout';
const PATH_COOKIE_DEBUG   = '/api/admin/test/auth/debug/cookie-info';

export function login(credentials) {
    return apiClient.post(PATH_LOGIN, credentials);
}

export function refreshAccessToken() {
    return apiClient.post(PATH_REFRESH);
}

export function logout() {
    return apiClient.post(PATH_LOGOUT);
}

export function fetchCookieDebug() {
    return apiClient.get(PATH_COOKIE_DEBUG);
}
