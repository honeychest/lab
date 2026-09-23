// 바이낸스 USDT-M 선물 REST 호출. 이 파일 밖에서는 fetch 를 하지 않는다.
// 키를 읽는 곳도 여기와 keys.js 뿐이다.

import { sign } from './signer.js';
import { loadCredentials } from './keys.js';

const BASE_URL = 'https://fapi.binance.com';
const TIMEOUT_MS = 10_000;
const TIME_SYNC_INTERVAL_MS = 30_000;
const EXCHANGE_INFO_TTL_MS = 10 * 60 * 1000;
const INTEGER_ID_KEYS = new Set([
    'orderId', // 주문 조회·수정·openOrders·positionRisk v3·account v3·수정 이력
    'amendmentId', // 주문 수정 이력
    'modifyId', // 주문 수정 이력의 amendment 객체
]);

export class JsonFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = 'JsonFormatError';
    }
}

function endOfJsonString(text, start) {
    for (let index = start + 1; index < text.length; index += 1) {
        if (text[index] === '\\') {
            index += 1;
        } else if (text[index] === '"') {
            return index + 1;
        }
    }
    return text.length;
}

function skipWhitespace(text, index) {
    while (/\s/.test(text[index] || '')) index += 1;
    return index;
}

function parseStringToken(text, start) {
    const end = endOfJsonString(text, start);
    return { raw: text.slice(start, end), end };
}

function transformJsonNumbers(text, shouldStringify) {
    const parseValue = (start, path) => {
        let index = skipWhitespace(text, start);
        const begin = index;
        if (text[index] === '"') {
            const token = parseStringToken(text, index);
            return { value: token.raw, end: token.end };
        }
        if (text[index] === '{') {
            index += 1;
            let value = '{';
            index = skipWhitespace(text, index);
            if (text[index] === '}') return { value: value + '}', end: index + 1 };
            while (index < text.length) {
                const keyToken = parseStringToken(text, index);
                const key = JSON.parse(keyToken.raw);
                value += text.slice(index, keyToken.end);
                index = skipWhitespace(text, keyToken.end);
                if (text[index] !== ':') throw new SyntaxError('invalid JSON object');
                value += text.slice(keyToken.end, index + 1);
                const child = parseValue(index + 1, [...path, key]);
                value += child.value;
                index = skipWhitespace(text, child.end);
                if (text[index] === '}') return { value: value + '}', end: index + 1 };
                if (text[index] !== ',') throw new SyntaxError('invalid JSON object');
                value += text.slice(child.end, index + 1);
                index = skipWhitespace(text, index + 1);
            }
            throw new SyntaxError('invalid JSON object');
        }
        if (text[index] === '[') {
            index += 1;
            let value = '[';
            index = skipWhitespace(text, index);
            if (text[index] === ']') return { value: value + ']', end: index + 1 };
            while (index < text.length) {
                const child = parseValue(index, path);
                value += child.value;
                index = skipWhitespace(text, child.end);
                if (text[index] === ']') return { value: value + ']', end: index + 1 };
                if (text[index] !== ',') throw new SyntaxError('invalid JSON array');
                value += text.slice(child.end, index + 1);
                index = skipWhitespace(text, index + 1);
            }
            throw new SyntaxError('invalid JSON array');
        }
        const endMatch = text.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/);
        if (!endMatch) throw new SyntaxError('invalid JSON value');
        const raw = endMatch[0];
        const end = index + raw.length;
        if (!shouldStringify(path, raw)) return { value: raw, end };
        if (!/^-?(?:0|[1-9]\d*)$/.test(raw)) {
            throw new JsonFormatError(`정수 ID에 소수점 또는 지수 표기를 사용할 수 없습니다: ${raw}`);
        }
        return { value: `"${raw}"`, end };
    };
    const parsed = parseValue(0, []);
    if (skipWhitespace(text, parsed.end) !== text.length) throw new SyntaxError('trailing JSON data');
    return parsed.value;
}

// JSON.parse 는 int64 주문 번호를 읽는 순간 Number 로 반올림한다.
// REST 응답에서 실제 식별자로 쓰는 키만 문자열화하고 id/i/t/M 같은 전역 키는 건드리지 않는다.
export function parseRestJsonWithStringIds(text) {
    return transformJsonNumbers(text, (path) => INTEGER_ID_KEYS.has(path.at(-1)));
}

// ORDER_TRADE_UPDATE 의 주문 객체(o) 안 식별자만 문자열화한다.
export function parseWebsocketJsonWithStringIds(text) {
    let eventType = null;
    try { eventType = JSON.parse(text)?.e; } catch { /* JSON.parse 가 아래에서 원래 오류를 낸다. */ }
    const keys = new Set(['i', 't', 'M']);
    return transformJsonNumbers(text, (path) => eventType === 'ORDER_TRADE_UPDATE'
        && path.length === 2 && path[0] === 'o' && keys.has(path[1]));
}

// 기존 호출부와 외부 시험의 REST 의미를 유지한다.
export const parseJsonWithStringIds = parseRestJsonWithStringIds;

// 실패를 세 종류로 나눈다. 이 구분이 전송 정책을 결정한다.
//   REJECTED    바이낸스가 확실히 거부했다. 다음 회차를 계속 보내도 된다.
//   UNKNOWN     접수됐는지 알 수 없다. 즉시 멈추고 조회로 확정해야 한다.
//   RATE_LIMIT  한도에 걸렸다. 재시도하지 않고 사용자 판단을 받는다.
//   FORMAT_ERROR 응답 식별자 형식이 안전하지 않다. 바이낸스 오류로 분류하지 않고 중단한다.
export class BinanceError extends Error {
    constructor(kind, message, { status = 0, code = null } = {}) {
        super(message);
        this.name = 'BinanceError';
        this.kind = kind;
        this.status = status;
        this.code = code;
    }
}

let serverTimeOffsetMs = 0;
let serverTimeSyncedAtMs = 0;
const exchangeInfoCache = new Map();
let lastUsage = {
    used1m: null,
    orderCount10s: null,
    orderCount1m: null,
    at: null,
};

function recordUsage(response) {
    const read = (name) => response.headers?.get(name) ?? null;
    const used1m = read('X-MBX-USED-WEIGHT-1M');
    const orderCount10s = read('X-MBX-ORDER-COUNT-10S');
    const orderCount1m = read('X-MBX-ORDER-COUNT-1M');
    if (used1m !== null || orderCount10s !== null || orderCount1m !== null) {
        lastUsage = {
            used1m: used1m === null ? lastUsage.used1m : Number(used1m),
            orderCount10s: orderCount10s === null ? lastUsage.orderCount10s : Number(orderCount10s),
            orderCount1m: orderCount1m === null ? lastUsage.orderCount1m : Number(orderCount1m),
            at: Date.now(),
        };
    }
}

export function usage() {
    return { ...lastUsage };
}

// 미리보기는 값이 바뀔 때마다 도는데 계좌·레버리지·포지션모드는 그 사이 거의 안 변한다.
// 짧게 캐시해 서명 호출 수를 줄인다. 캐시는 최적화일 뿐이라 비어도 동작한다.
const responseCache = new Map();

async function cached(key, ttlMs, fetcher) {
    const hit = responseCache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await fetcher();
    responseCache.set(key, { at: Date.now(), value });
    return value;
}

// 주문을 내거나 취소한 뒤에는 잔고가 바뀐다. 그때는 캐시를 버려야 한다.
export function clearAccountCache() {
    responseCache.clear();
}

function toQuery(params) {
    return Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
}

// 실패한 응답 하나를 종류가 있는 오류로 바꾼다.
// 공개 호출과 서명 호출이 같은 규칙을 써야 해서 한 곳에 둔다 —
// 두 곳에 복제해 두면 한쪽만 고쳐져 실패 분류가 어긋난다.
async function toError(response) {
    const text = await response.text().catch(() => '');
    let code = null;
    let msg = text;
    try {
        const parsed = JSON.parse(parseJsonWithStringIds(text));
        code = parsed.code ?? null;
        msg = parsed.msg ?? text;
    } catch (error) {
        if (error instanceof JsonFormatError) {
            return new BinanceError('FORMAT_ERROR', `바이낸스 오류 응답 형식 오류: ${error.message}`);
        }
        // 본문이 JSON 이 아니면 그대로 둔다.
    }
    // 오류 메시지에 요청 문자열을 싣지 않는다 — 서명 파라미터가 새어나갈 수 있다.
    if (response.status === 429 || response.status === 418 || code === -1003) {
        return new BinanceError('RATE_LIMIT', `요청 한도에 걸렸습니다: ${msg}`, {
            status: response.status,
            code,
        });
    }
    if (response.status >= 500) {
        // 5xx 는 처리됐을 수도 있다.
        return new BinanceError('UNKNOWN', `바이낸스 서버 오류: HTTP ${response.status} ${msg}`, {
            status: response.status,
            code,
        });
    }
    return new BinanceError('REJECTED', msg || `HTTP ${response.status}`, {
        status: response.status,
        code,
    });
}

async function readJson(response) {
    const text = await response.text().catch(() => '');
    if (!text) return {};
    try {
        return JSON.parse(parseRestJsonWithStringIds(text));
    } catch (error) {
        if (error instanceof JsonFormatError) {
            throw new BinanceError('FORMAT_ERROR', `바이낸스 응답 형식 오류: ${error.message}`);
        }
        throw error;
    }
}

async function rawRequest(method, path, query) {
    const url = `${BASE_URL}${path}${query ? `?${query}` : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
        response = await fetch(url, { method, signal: controller.signal });
    } catch (error) {
        // 네트워크 실패와 타임아웃은 접수 여부를 알 수 없다.
        throw new BinanceError('UNKNOWN', `요청이 끝나지 않았습니다: ${error.name}`);
    } finally {
        clearTimeout(timer);
    }

    recordUsage(response);
    if (!response.ok) throw await toError(response);
    return readJson(response);
}

export async function publicRequest(method, path, params = {}) {
    return rawRequest(method, path, toQuery(params));
}

export async function signedRequest(method, path, params = {}) {
    const credentials = await loadCredentials();
    if (!credentials) throw new BinanceError('REJECTED', 'API 키가 없습니다');

    const withTime = { ...params, timestamp: await exchangeTimeMs(), recvWindow: 5000 };
    const query = toQuery(withTime);
    const signature = await sign(query, credentials.secretKey);
    const url = `${BASE_URL}${path}?${query}&signature=${signature}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
        response = await fetch(url, {
            method,
            headers: { 'X-MBX-APIKEY': credentials.apiKey },
            signal: controller.signal,
        });
    } catch (error) {
        throw new BinanceError('UNKNOWN', `요청이 끝나지 않았습니다: ${error.name}`);
    } finally {
        clearTimeout(timer);
    }

    recordUsage(response);
    if (!response.ok) throw await toError(response);
    return readJson(response);
}

async function apiKeyRequest(method, path) {
    const credentials = await loadCredentials();
    if (!credentials) throw new BinanceError('REJECTED', 'API 키가 없습니다');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: { 'X-MBX-APIKEY': credentials.apiKey },
            signal: controller.signal,
        });
    } catch (error) {
        throw new BinanceError('UNKNOWN', `요청이 끝나지 않았습니다: ${error.name}`);
    } finally {
        clearTimeout(timer);
    }
    recordUsage(response);
    if (!response.ok) throw await toError(response);
    return readJson(response);
}

async function exchangeTimeMs() {
    const now = Date.now();
    if (now - serverTimeSyncedAtMs > TIME_SYNC_INTERVAL_MS) {
        const response = await publicRequest('GET', '/fapi/v1/time');
        if (typeof response.serverTime !== 'number') {
            throw new BinanceError('REJECTED', '바이낸스 서버 시각을 받지 못했습니다');
        }
        serverTimeOffsetMs = response.serverTime - now;
        serverTimeSyncedAtMs = now;
    }
    return Date.now() + serverTimeOffsetMs;
}

// 캐시는 성능 최적화일 뿐 계약이 아니다. service worker 가 재시작해 비어도 동작해야 한다.
export async function symbolInfo(symbol) {
    const cached = exchangeInfoCache.get(symbol);
    if (cached && Date.now() - cached.at < EXCHANGE_INFO_TTL_MS) return cached.info;

    const response = await publicRequest('GET', '/fapi/v1/exchangeInfo', { symbol });
    const info = (response.symbols || []).find((s) => s.symbol === symbol);
    if (!info) throw new BinanceError('REJECTED', `심볼을 찾을 수 없습니다: ${symbol}`);
    exchangeInfoCache.set(symbol, { at: Date.now(), info });
    return info;
}

export async function bookTicker(symbol) {
    return publicRequest('GET', '/fapi/v1/ticker/bookTicker', { symbol });
}

export async function markPrice(symbol) {
    return publicRequest('GET', '/fapi/v1/premiumIndex', { symbol });
}

export async function listenKeyCreate() {
    return apiKeyRequest('POST', '/fapi/v1/listenKey');
}

export async function listenKeyKeepalive() {
    return apiKeyRequest('PUT', '/fapi/v1/listenKey');
}

export async function positionRiskFresh() {
    return signedRequest('GET', '/fapi/v3/positionRisk');
}

export async function premiumIndexAll() {
    return publicRequest('GET', '/fapi/v1/premiumIndex');
}

export async function tickerPriceAll() {
    return publicRequest('GET', '/fapi/v1/ticker/price');
}

export async function tickerPrice(symbol) {
    return publicRequest('GET', '/fapi/v1/ticker/price', { symbol });
}

export async function premiumIndex(symbol) {
    return markPrice(symbol);
}

export async function klines(symbol, start, end) {
    return publicRequest('GET', '/fapi/v1/klines', {
        symbol,
        interval: '1m',
        startTime: start,
        endTime: end,
    });
}

export async function markPriceKlines(symbol, start, end) {
    return publicRequest('GET', '/fapi/v1/markPriceKlines', {
        symbol,
        interval: '1m',
        startTime: start,
        endTime: end,
    });
}

export async function positionMode() {
    const response = await cached('positionMode', 30_000, () =>
        signedRequest('GET', '/fapi/v1/positionSide/dual'),
    );
    return response.dualSidePosition === true ? 'HEDGE' : 'ONE_WAY';
}

export async function futuresAccount() {
    return cached('account', 5_000, () => signedRequest('GET', '/fapi/v3/account'));
}

export async function positionRisk(symbol) {
    return cached(`positionRisk:${symbol}`, 5_000, () =>
        signedRequest('GET', '/fapi/v2/positionRisk', { symbol }),
    );
}

export async function openOrders(symbol) {
    return signedRequest('GET', '/fapi/v1/openOrders', { symbol });
}

export async function orderByClientId(symbol, origClientOrderId) {
    return signedRequest('GET', '/fapi/v1/order', { symbol, origClientOrderId });
}

export async function modifyOrder(params) {
    return signedRequest('PUT', '/fapi/v1/order', params);
}

export async function orderById(symbol, orderId) {
    return signedRequest('GET', '/fapi/v1/order', { symbol, orderId });
}

// 심볼 없이 전체 미체결 주문을 조회한다. 바이낸스 가중치가 40이라 자동 반복하지 않는다.
export async function allOpenOrders() {
    return signedRequest('GET', '/fapi/v1/openOrders');
}

export async function orderAmendments(symbol, orderId) {
    return signedRequest('GET', '/fapi/v1/orderAmendment', { symbol, orderId });
}

export async function placeOrder(params, { test = false } = {}) {
    return signedRequest('POST', test ? '/fapi/v1/order/test' : '/fapi/v1/order', params);
}

export async function cancelAllOpenOrders(symbol) {
    return signedRequest('DELETE', '/fapi/v1/allOpenOrders', { symbol });
}
