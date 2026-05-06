import { useCallback, useEffect, useState } from 'react';
import * as adminApi from '../api/adminApi';

export default function useVisitorLogs() {
    const [visitorData, setVisitorData] = useState(null);
    const [visitorLoading, setVisitorLoading] = useState(false);
    const [visitorError, setVisitorError] = useState(null);

    const loadVisitorLogs = useCallback(async () => {
        setVisitorLoading(true);
        setVisitorError(null);
        try {
            const data = await adminApi.getVisitorLogs();
            setVisitorData(data);
        } catch (e) {
            setVisitorError(e.response?.data?.error ?? '조회 실패');
        } finally {
            setVisitorLoading(false);
        }
    }, []);

    useEffect(() => {
        loadVisitorLogs();
    }, [loadVisitorLogs]);

    return { visitorData, visitorLoading, visitorError, loadVisitorLogs };
}
