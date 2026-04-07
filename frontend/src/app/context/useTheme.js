import { createContext, useContext, useCallback } from 'react';

export const ThemeContext = createContext({
    themes: {},
    setPageTheme: () => {},
});

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
