// [AGENT] TradingView Advanced Chart 위젯 컴포넌트
// [AGENT] T4-TASK: REQ-001 — symbol props, setSymbol/widgetKey fallback, 로드 실패 재시도, overlaySlot 구조
import { useEffect, useRef, useState } from 'react';

export default function TradingViewWidget({ symbol, overlaySlot }) {
    const [hasError, setHasError] = useState(false);
    const [widgetKey, setWidgetKey] = useState(0);
    const containerRef = useRef(null);
    const widgetRef = useRef(null);
    const scriptRef = useRef(null);
    const toTvSymbol = (s) => `BINANCE:${s}.P`;
    const symbolRef = useRef(symbol);

    useEffect(() => {
        symbolRef.current = symbol;
    }, [symbol]);

    useEffect(() => {
        if (hasError) return;

        const containerId = `tradingview_widget_${widgetKey}`;

        function initWidget() {
            try {
                widgetRef.current = new window.TradingView.widget({
                    container_id: containerId,
                    symbol: toTvSymbol(symbolRef.current),
                    interval: '5',
                    theme: 'dark',
                    locale: 'en',
                    timezone: 'Asia/Seoul',
                    autosize: true,
                    hide_side_toolbar: false,
                    allow_symbol_change: true,
                });
            } catch {
                setHasError(true);
            }
        }

        if (window.TradingView) {
            initWidget();
        } else {
            const script = document.createElement('script');
            script.src = 'https://s3.tradingview.com/tv.js';
            script.async = true;
            script.onload = initWidget;
            script.onerror = () => setHasError(true);
            document.head.appendChild(script);
            scriptRef.current = script;
        }

        return () => {
            if (widgetRef.current && typeof widgetRef.current.remove === 'function') {
                try { widgetRef.current.remove(); } catch { /* DOM already removed */ }
            }
            widgetRef.current = null;
            if (scriptRef.current) {
                scriptRef.current.remove();
                scriptRef.current = null;
            }
        };
    }, [widgetKey, hasError]);

    useEffect(() => {
        if (!widgetRef.current || hasError) return;

        if (typeof widgetRef.current.setSymbol === 'function') {
            try {
                widgetRef.current.setSymbol(toTvSymbol(symbol), '5', () => {});
            } catch {
                setTimeout(() => setWidgetKey((k) => k + 1), 0);
            }
        } else {
            setTimeout(() => setWidgetKey((k) => k + 1), 0);
        }
    }, [symbol, hasError]);

    if (hasError) {
        return (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderRadius: '6px',
                }}
            >
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', fontFamily: "'Pretendard', sans-serif" }}>
                    차트를 불러오지 못했습니다
                </div>
                <button
                    onClick={() => {
                        setHasError(false);
                        setWidgetKey((k) => k + 1);
                    }}
                    style={{
                        padding: '6px 14px',
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.7)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: "'Pretendard', sans-serif",
                    }}
                >
                    재시도
                </button>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div
                key={widgetKey}
                id={`tradingview_widget_${widgetKey}`}
                ref={containerRef}
                style={{ width: '100%', height: '100%' }}
            />
            {overlaySlot && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    {overlaySlot}
                </div>
            )}
        </div>
    );
}
