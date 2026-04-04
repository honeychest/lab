import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '@/api/apiClient.js';

const ThemeContext = createContext({
    themes: {},
    setPageTheme: () => {},
});

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

/** 특정 페이지의 현재 테마를 반환 */
export function usePageTheme(page) {
    const { themes, setPageTheme } = useContext(ThemeContext);
    const theme = themes[page] ?? 'dark';
    const setTheme = useCallback((t) => setPageTheme(page, t), [page, setPageTheme]);
    return [theme, setTheme];
}

/** 전체 테마 맵 + setter */
export function useThemeContext() {
    return useContext(ThemeContext);
}
