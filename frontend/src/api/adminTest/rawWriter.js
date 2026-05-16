import api from '@/api/apiClient.js';

export function fetchRawWriterDryRunSummaries() {
    return api.get('/api/admin/test/agg-trade/raw-writer/dry-run-summaries');
}

export function fetchRawWriterShadowComparison(minutes = 60, graceSeconds = 20) {
    return api.get('/api/admin/test/agg-trade/raw-writer/shadow-comparison', {
        params: { minutes, graceSeconds },
    });
}

export function fetchRawWriterShadowComparisonWindows(minutes = [5, 15, 60, 180], graceSeconds = 20) {
    return api.get('/api/admin/test/agg-trade/raw-writer/shadow-comparison/windows', {
        params: { minutes: minutes.join(','), graceSeconds },
    });
}

export function fetchRawWriterKafkaObservability() {
    return api.get('/api/admin/test/agg-trade/raw-writer/kafka-observability');
}

export function fetchRawWriterKafkaObservabilityWindows(minutes = 60, bucketSeconds = 60) {
    return api.get('/api/admin/test/agg-trade/raw-writer/kafka-observability/windows', {
        params: { minutes, bucketSeconds },
    });
}
