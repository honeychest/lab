// AdminPage가 사용하는 모든 백엔드 호출 한 곳 모음.
// 각 함수는 r.data를 반환하고 에러는 그대로 throw → 호출자가 e.response?.data?.error 사용 가능.

import apiClient from '@/api/apiClient.js';

// ── Data Gap ──────────────────────────────────────────────────────────────
export const getDataGapCheck = (params) =>
    apiClient.get('/api/admin/data-gap/check', { params }).then(r => r.data);

// ── Backfill ──────────────────────────────────────────────────────────────
export const getBackfillJobs = () =>
    apiClient.get('/api/admin/backfill/jobs').then(r => r.data);

export const postBackfillCollect = (body) =>
    apiClient.post('/api/admin/backfill/collect', body).then(r => r.data);

export const deleteBackfillFlat = (params) =>
    apiClient.delete('/api/admin/backfill/flat', { params }).then(r => r.data);

export const getBackfillHealth = (params) =>
    apiClient.get('/api/admin/backfill/health', { params }).then(r => r.data);

export const getFlatCorrectionHealth = (params) =>
    apiClient.get('/api/admin/backfill/flat-correction/health', { params }).then(r => r.data);

export const postFlatCorrection = (body) =>
    apiClient.post('/api/admin/backfill/flat-correction', body).then(r => r.data);

export const getOutlierCorrectionHealth = (params) =>
    apiClient.get('/api/admin/backfill/outlier-correction/health', { params }).then(r => r.data);

export const postOutlierCorrection = (body) =>
    apiClient.post('/api/admin/backfill/outlier-correction', body).then(r => r.data);

// ── AggTrade ──────────────────────────────────────────────────────────────
export const postAggtradeRollup = (body) =>
    apiClient.post('/api/admin/aggtrade/rollup', body).then(r => r.data);

// ── Feature Flags ─────────────────────────────────────────────────────────
export const getFeatureFlags = () =>
    apiClient.get('/api/admin/feature-flags').then(r => r.data);

export const patchFeatureFlags = (next) =>
    apiClient.patch('/api/admin/feature-flags', next).then(r => r.data);

// ── Monitor ───────────────────────────────────────────────────────────────
export const getVisitorLogs = () =>
    apiClient.get('/api/admin/monitor/visitor-logs').then(r => r.data);

export const getAllowedIps = () =>
    apiClient.get('/api/admin/monitor/allowed-ips').then(r => r.data);

export const deleteAllowedIp = (ip) =>
    apiClient.delete(`/api/admin/monitor/allowed-ips/${encodeURIComponent(ip)}`).then(r => r.data);

export const getMyIp = () =>
    apiClient.get('/api/admin/my-ip').then(r => r.data);

// ── Auth ──────────────────────────────────────────────────────────────────
export const postLogout = () =>
    apiClient.post('/api/auth/logout').then(r => r.data);
