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
 * 아카이빙 실행 — S3 업로드 + DB 삭제 전체
 * @param {number} startMs Unix ms (inclusive)
 * @param {number} endMs   Unix ms (exclusive)
 */
export function runArchive(startMs, endMs) {
    return api.post('/api/admin/archive/run', { startMs, endMs });
}

/**
 * S3 업로드 + archive_log INSERT(complete='N') 만 실행. 삭제 없음.
 * @param {number} startMs Unix ms (inclusive)
 * @param {number} endMs   Unix ms (exclusive)
 */
export function runArchiveUpload(startMs, endMs) {
    return api.post('/api/admin/archive/upload', { startMs, endMs });
}

/**
 * S3 파일 목록 미리보기 — DB INSERT 없음
 */
export function fetchScanPreview() {
    return api.get('/api/admin/archive/scan-preview');
}

/**
 * S3 기존 파일 스캔 → s3_archive_log 초기화 (1회용)
 */
export function runScan() {
    return api.post('/api/admin/archive/scan');
}
