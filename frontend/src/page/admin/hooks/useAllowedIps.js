import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../api/adminApi';

// 토글 enabled === true 일 때만 초기 로딩한다.
export default function useAllowedIps({ enabled }) {
    const [allowedIps, setAllowedIps] = useState([]);
    const [allowedLoading, setAllowedLoading] = useState(false);
    const [allowedError, setAllowedError] = useState(null);

    const loadAllowedIps = useCallback(async () => {
        setAllowedLoading(true);
        setAllowedError(null);
        try {
            const data = await adminApi.getAllowedIps();
            setAllowedIps(data ?? []);
        } catch (e) {
            setAllowedIps([]);
            setAllowedError(e?.response?.status === 403 ? '기능이 비활성화되어 있습니다.' : '허용 IP 조회 실패');
        } finally {
            setAllowedLoading(false);
        }
    }, []);

    const handleDeleteAllowedIp = async (ip) => {
        if (!ip) return;
        setAllowedLoading(true);
        setAllowedError(null);
        try {
            await adminApi.deleteAllowedIp(ip);
            await loadAllowedIps();
        } catch (e) {
            setAllowedError(e?.response?.status === 403 ? '기능이 비활성화되어 있습니다.' : '허용 IP 삭제 실패');
            setAllowedLoading(false);
        }
    };

    useEffect(() => {
        if (!enabled) return;
        loadAllowedIps();
    }, [enabled, loadAllowedIps]);

    return { allowedIps, allowedLoading, allowedError, loadAllowedIps, handleDeleteAllowedIp };
}
