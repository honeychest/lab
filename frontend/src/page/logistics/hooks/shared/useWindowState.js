import { useState, useEffect } from 'react';

export default function useWindowState() {
    const DESKTOP_VIEW_STORAGE_KEY = 'logistics.desktopView';

    const [narrowScreen, setNarrowScreen] = useState(() =>
        window.matchMedia('(max-width: 1024px)').matches
    );
    const [desktopView, setDesktopView] = useState(() =>
        localStorage.getItem(DESKTOP_VIEW_STORAGE_KEY) === 'true'
    );

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1024px)');
        const handler = (event) => setNarrowScreen(event.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);


    const handleDesktopViewOpen = () => {
        localStorage.setItem(DESKTOP_VIEW_STORAGE_KEY, 'true');
        setDesktopView(true);
    };

    const handleDesktopViewClose = () => {
        localStorage.removeItem(DESKTOP_VIEW_STORAGE_KEY);
        setDesktopView(false);
    };

    return {
        narrowScreen,
        desktopView,
        handleDesktopViewOpen,
        handleDesktopViewClose,
    };
}
