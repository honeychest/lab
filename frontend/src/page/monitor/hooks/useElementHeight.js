import { useEffect, useRef, useState } from 'react';

export function useElementHeight() {
    const ref = useRef(null);
    const [height, setHeight] = useState(null);

    useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);

    return [ref, height];
}
