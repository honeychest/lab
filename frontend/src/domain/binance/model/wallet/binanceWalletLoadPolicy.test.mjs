import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyWalletResponse,
    classifyWalletError,
} from './binanceWalletLoadPolicy.js';

test('classifyWalletResponse treats non-json proxy fallback as server 502', () => {
    const outcome = classifyWalletResponse({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        data: '<html>50x</html>',
    });

    assert.deepEqual(outcome, { kind: 'server-error', code: '502' });
});

test('classifyWalletError keeps 4xx inside wallet card', () => {
    const outcome = classifyWalletError({
        response: { status: 403 },
    });

    assert.deepEqual(outcome, {
        kind: 'wallet-error',
        message: '잔고 조회에 실패했습니다.',
    });
});
