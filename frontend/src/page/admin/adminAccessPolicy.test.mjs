import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRedirectToAdminLogin } from './adminAccessPolicy.js';

test('shouldRedirectToAdminLogin returns false while access is still loading', () => {
    assert.equal(shouldRedirectToAdminLogin({ canAccess: null, isForbidden: false }), false);
});

test('shouldRedirectToAdminLogin returns true when access is forbidden', () => {
    assert.equal(shouldRedirectToAdminLogin({ canAccess: null, isForbidden: true }), true);
});

test('shouldRedirectToAdminLogin returns false when access check resolves to false without 403', () => {
    assert.equal(shouldRedirectToAdminLogin({ canAccess: false, isForbidden: false }), false);
});

test('shouldRedirectToAdminLogin returns false when access is allowed', () => {
    assert.equal(shouldRedirectToAdminLogin({ canAccess: true, isForbidden: false }), false);
});
