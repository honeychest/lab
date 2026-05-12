import { useEffect, useRef, useState } from 'react';
import { getTickerPanelMinimumSize } from '../panel/tickerPanelStability.js';

export function useTickerPanelStability(ticker) {
    const wrapperRef = useRef(null);
    const [savedHeight, setSavedHeight] = useState(null);
    const [savedWidth, setSavedWidth] = useState(null);

    useEffect(() => {
        if (ticker !== null && wrapperRef.current) {
            setSavedHeight(wrapperRef.current.offsetHeight);
            setSavedWidth(wrapperRef.current.offsetWidth);
        }
    }, [ticker]);

    return {
        wrapperRef,
        minimumSizeStyle: getTickerPanelMinimumSize({
            ticker,
            savedHeight,
            savedWidth,
        }),
    };
}
