import api from '@/api/apiClient.js';

export function fetchRawWriterDryRunSummaries() {
    return api.get('/api/admin/test/agg-trade/raw-writer/dry-run-summaries');
}

export function fetchRawWriterShadowComparison(minutes = 60) {
    return api.get('/api/admin/test/agg-trade/raw-writer/shadow-comparison', {
        params: { minutes },
    });
}

export function fetchRawWriterShadowComparisonWindows(minutes = [5, 15, 60, 180]) {
    return api.get('/api/admin/test/agg-trade/raw-writer/shadow-comparison/windows', {
        params: { minutes: minutes.join(',') },
    });
}
