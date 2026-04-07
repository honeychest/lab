import api from '@/api/apiClient.js';

/**
 * 아카이빙 대상 건수 조회
 * @param {number} startMs Unix ms (inclusive)
 * @param {number} endMs   Unix ms (exclusive)
 */
export function fetchArchiveCount(startMs, endMs) {
    return api.post('/api/admin/archive/count', { startMs, endMs });
}

/**
 * 아카이빙 실행 — S3 업로드 후 DB 삭제
 * @param {number} startMs Unix ms (inclusive)
 * @param {number} endMs   Unix ms (exclusive)
 */
export function runArchive(startMs, endMs) {
    return api.post('/api/admin/archive/run', { startMs, endMs });
}
