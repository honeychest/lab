import api from '@/api/apiClient.js';

export function fetchRawWriterDryRunSummaries() {
    return api.get('/api/admin/test/agg-trade/raw-writer/dry-run-summaries');
}

