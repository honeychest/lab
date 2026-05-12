import { useEffect, useState } from 'react';
import apiClient from '@/api/apiClient.js';
import { useAdminAccess } from '@/shared/lib/useAdminAccess.js';
import { composeCanEdit, mapThresholdResponse } from '../thresholdPolicy.js';

// Loads the FUTURES threshold once and exposes whether the current client may edit it.
// `canEdit` already composes server flag with admin-access policy — callers don't compose.
export function useTradeThreshold() {
    const [threshold, setThreshold] = useState(null);
    const [serverCanEdit, setServerCanEdit] = useState(false);
    const { hasAdminAccess } = useAdminAccess();

    useEffect(() => {
        let cancelled = false;
        apiClient.get('/api/binance/trades/threshold').then(r => {
            if (cancelled) return;
            const mapped = mapThresholdResponse(r.data);
            setThreshold(mapped.value);
            setServerCanEdit(mapped.canEdit);
        });
        return () => { cancelled = true; };
    }, []);

    return {
        threshold,
        setThreshold,
        canEdit: composeCanEdit(serverCanEdit, hasAdminAccess),
    };
}
