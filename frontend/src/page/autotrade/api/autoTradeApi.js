import apiClient from '@/api/apiClient.js';

export const getAutoTradeConfig = () =>
    apiClient.get('/api/admin/binance/autotrade/config').then((response) => response.data);

export const patchAutoTradeConfig = (updates) =>
    apiClient.patch('/api/admin/binance/autotrade/config', updates).then((response) => response.data);

export const getAutoTradeExecution = () =>
    apiClient.get('/api/admin/binance/autotrade/execution').then((response) => response.data);

export const patchAutoTradeExecution = (updates) =>
    apiClient.patch('/api/admin/binance/autotrade/execution', updates).then((response) => response.data);

export const getAutoTradeStatus = () =>
    apiClient.get('/api/admin/binance/autotrade/execution/status').then((response) => response.data);

export const getAutoTradeReconciliation = () =>
    apiClient.get('/api/admin/binance/autotrade/reconciliation').then((response) => response.data);

export const getAutoTradeSymbols = () =>
    apiClient.get('/api/admin/binance/autotrade/symbols').then((response) => response.data);

export const postAutoTradeRunOnce = () =>
    apiClient.post('/api/admin/binance/autotrade/execution/run-once').then((response) => response.data);

export const postAutoTradeResetUnknownOrder = () =>
    apiClient.post('/api/admin/binance/autotrade/execution/reset-unknown-order').then((response) => response.data);
