import { useEffect, useState } from 'react';
import * as adminApi from '../api/adminApi';
import { useAdminAuth } from '@/shared/auth/useAdminAuth.js';

export default function useMyIp() {
    const [myIp, setMyIp] = useState(null);
    const [loggingOut, setLoggingOut] = useState(false);
    const { refresh } = useAdminAuth();

    useEffect(() => {
        adminApi.getMyIp().then(setMyIp).catch(() => {});
    }, []);

    const handleLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await adminApi.postLogout();
        } catch {
            // 서버가 401/이미 만료여도 클라이언트 상태는 갱신
        }
        await refresh();
        setLoggingOut(false);
    };

    return { myIp, loggingOut, handleLogout };
}
