/**
 * admin/test 전용 — 비동기 API 호출 한 번을 감싸 시각·소요·상태·본문·에러를 기록한다.
 * 다른 화면에서는 import 하지 않는다.
 *
 * @param {string} requestSummary 사람이 읽기 위한 요청 설명 (메서드·경로 등)
 * @param {() => Promise<{ status?: number, data?: unknown }>} asyncFn axios 또는 fetch 래퍼 호출
 * @returns {Promise<ApiCallLog>}
 */

/**
 * @typedef {Object} ApiCallLog
 * @property {boolean} ok
 * @property {string} startedAt ISO 시각
 * @property {number} durationMs
 * @property {number | null} statusCode
 * @property {unknown} responseBody 성공 시 응답 data, 실패 시 에러 응답 body(있으면)
 * @property {string | null} errorMessage
 * @property {string} requestSummary
 */

export async function logApiCall(requestSummary, asyncFn) {
    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();
    const t0 = performance.now();

    try {
        const res = await asyncFn();
        const durationMs = Math.round(performance.now() - t0);
        const statusCode = res?.status ?? null;
        const responseBody = res?.data ?? null;
        if (statusCode != null && statusCode >= 400) {
            let errorMessage = `HTTP ${statusCode}`;
            if (responseBody != null && typeof responseBody === 'object' && responseBody.message) {
                errorMessage = String(responseBody.message);
            }
            return {
                ok: false,
                startedAt: startedAtIso,
                durationMs,
                statusCode,
                responseBody,
                errorMessage,
                requestSummary,
            };
        }
        return {
            ok: true,
            startedAt: startedAtIso,
            durationMs,
            statusCode,
            responseBody,
            errorMessage: null,
            requestSummary,
        };
    } catch (err) {
        const durationMs = Math.round(performance.now() - t0);
        const statusCode = err?.response?.status ?? null;
        const responseBody = err?.response?.data ?? null;
        let errorMessage = err?.message ?? String(err);
        if (responseBody != null && typeof responseBody === 'object' && responseBody.message) {
            errorMessage = String(responseBody.message);
        }
        return {
            ok: false,
            startedAt: startedAtIso,
            durationMs,
            statusCode,
            responseBody,
            errorMessage,
            requestSummary,
        };
    }
}
