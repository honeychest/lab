import { useState, useEffect, useCallback } from 'react';
import apiClient from '@/api/apiClient.js';
import { ThemeContext } from './useTheme.js';

export function ThemeProvider({ children }) {
    const [themes, setThemes] = useState({});

    useEffect(() => {
        apiClient.get('/api/site-theme')
            .then((res) => setThemes(res.data))
            .catch(() => {});
    }, []);

    const setPageTheme = useCallback(async (page, theme) => {
        try {
            // TODO: admin 인증 완성 후 /api/admin/site-theme 로 복귀
            const res = await apiClient.patch('/api/site-theme', { [page]: theme });
            setThemes(res.data);
        } catch {
            // admin 권한 없으면 무시
        }
    }, []);

    return (
        <ThemeContext.Provider value={{ themes, setPageTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
