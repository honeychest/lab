import { useEffect, useState } from 'react';
import apiClient from '@/api/apiClient.js';

let cachedAdminAccess = null;
let pendingAdminAccessCheck = null;

async function checkAdminAccess() {
    if (cachedAdminAccess !== null) return cachedAdminAccess;
    if (pendingAdminAccessCheck) return pendingAdminAccessCheck;

    pendingAdminAccessCheck = apiClient
        .get('/api/admin/test/auth/debug/cookie-info')
        .then(() => {
            cachedAdminAccess = true;
            return true;
        })
        .catch(() => {
            cachedAdminAccess = false;
            return false;
        })
        .finally(() => {
            pendingAdminAccessCheck = null;
        });

    return pendingAdminAccessCheck;
}

export function useAdminAccess(enabled = true) {
    const [hasAdminAccess, setHasAdminAccess] = useState(
        cachedAdminAccess === null ? null : cachedAdminAccess
    );
    const isCheckingAdminAccess = enabled && hasAdminAccess === null;

    useEffect(() => {
        if (!enabled || hasAdminAccess !== null) return;
        let cancelled = false;

        checkAdminAccess().then((allowed) => {
            if (cancelled) return;
            setHasAdminAccess(allowed);
        });

        return () => {
            cancelled = true;
        };
    }, [enabled, hasAdminAccess]);

    return { hasAdminAccess, isCheckingAdminAccess };
}
