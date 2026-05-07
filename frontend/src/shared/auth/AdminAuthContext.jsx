// 관리자 접근 권한 단일 소스 — /api/admin/data-gap/access 결과를 앱 전역에서 공유.
// 리다이렉트 정책은 각 소비자(페이지)가 결정한다 (페이지마다 목적지가 다르므로).

import { useCallback, useEffect, useState } from 'react';
import apiClient from '@/api/apiClient.js';
import AdminAuthContext from './AdminAuthContext.js';

export function AdminAuthProvider({ children }) {
    const [canAccess, setCanAccess] = useState(null); // null: 미확인, true/false: 확인됨
    const [isForbidden, setIsForbidden] = useState(false); // 403 응답 여부

    const fetchAccess = useCallback(() => {
        setCanAccess(null);
        setIsForbidden(false);
        return apiClient.get('/api/admin/data-gap/access')
            .then((r) => setCanAccess(Boolean(r.data?.canAccess)))
            .catch((e) => {
                if (e?.response?.status === 403) {
                    setIsForbidden(true);
                }
                setCanAccess(false);
            });
    }, []);

    useEffect(() => {
        apiClient.get('/api/admin/data-gap/access')
            .then((r) => setCanAccess(Boolean(r.data?.canAccess)))
            .catch((e) => {
                if (e?.response?.status === 403) {
                    setIsForbidden(true);
                }
                setCanAccess(false);
            });
    }, []);

    return (
        <AdminAuthContext.Provider value={{ canAccess, isForbidden, refresh: fetchAccess }}>
            {children}
        </AdminAuthContext.Provider>
    );
}
