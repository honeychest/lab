import { useEffect } from 'react';

// 페이지가 마운트된 동안 Layout <main>의 세로 스크롤을 잠근다.
export function useLockMainScroll() {
    useEffect(() => {
        const main = document.querySelector('main');
        if (!main) return;
        const prev = main.style.overflowY;
        main.style.overflowY = 'hidden';
        return () => { main.style.overflowY = prev; };
    }, []);
}
