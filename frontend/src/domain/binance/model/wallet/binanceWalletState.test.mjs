import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createInitialWalletState,
    applyWalletOutcome,
} from './binanceWalletState.js';

test('applyWalletOutcome reveals account data after successful load', () => {
    const state = applyWalletOutcome(
        createInitialWalletState(),
        { kind: 'success', data: { balances: [{ asset: 'BTC' }] } },
    );

    assert.deepEqual(state, {
        accountInfo: { balances: [{ asset: 'BTC' }] },
        walletLoading: false,
        walletError: null,
        serverError: null,
    });
});

test('applyWalletOutcome keeps loading screen blocked for server errors', () => {
    const state = applyWalletOutcome(
        createInitialWalletState(),
        { kind: 'server-error', code: '503' },
    );

    assert.deepEqual(state, {
        accountInfo: null,
        walletLoading: true,
        walletError: null,
        serverError: '503',
    });
});
