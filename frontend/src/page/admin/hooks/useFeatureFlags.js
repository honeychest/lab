import { useEffect, useState } from 'react';
import * as adminApi from '../api/adminApi';

export default function useFeatureFlags() {
    const [flags, setFlags] = useState({ tradeThresholdEdit: true, monitorAllowedIpManage: false });
    const [flagsLoading, setFlagsLoading] = useState(true);

    useEffect(() => {
        adminApi.getFeatureFlags()
            .then(setFlags)
            .catch(() => {})
            .finally(() => setFlagsLoading(false));
    }, []);

    const patchFlags = async (next) => {
        setFlags(next);
        try {
            const updated = await adminApi.patchFeatureFlags(next);
            setFlags(updated);
        } catch {
            // ignore
        }
    };

    return { flags, flagsLoading, patchFlags };
}
