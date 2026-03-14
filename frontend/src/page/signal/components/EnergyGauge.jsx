// [AGENT] Signal Dashboard EnergyGauge — ECharts Grade Gauge (뒤집힌 반원, 중앙 아래)
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

const getRealColor = (ratio) => {
    if (ratio < 25) return '#00b359';
    if (ratio < 50) return '#00e887';
    if (ratio < 75) return '#ff5c00';
    return '#ff3b5c';
};

export default function EnergyGauge({ longEnergy, shortEnergy, compact = false }) {
    const chartRef = useRef(null);
    const instanceRef = useRef(null);
    const prevRatioRef = useRef(50);
    const realRatioRef = useRef(50);
    const jitterTimerRef = useRef(null);
    const [labelState, setLabelState] = useState({ text: 'Long', color: getRealColor(50) });

    useEffect(() => {
        if (!chartRef.current) return;

        if (!instanceRef.current) {
            instanceRef.current = echarts.init(chartRef.current);
            
            const initialOption = {
                series: [
                    {
                        type: 'gauge',
                        startAngle: 236,
                        endAngle: -58,
                        min: 0,
                        max: 100,
                        splitNumber: 5,
                        axisLine: {
                            lineStyle: { // 게이지 스타일
                                width: compact ? 8 : 16,
                                color: [
                                    // 기존 5색 zone (복구용)
                                    // [0.20, 'rgba(0,232,135,0.8)'],
                                    // [0.45, 'rgba(0,232,135,0.4)'],
                                    // [0.55, 'rgba(255,255,255,0.7)'],
                                    // [0.80, 'rgba(255,59,92,0.4)'],
                                    // [1,    'rgba(255,59,92,0.8)'],
                                    [0.25, '#00b359'],  // 진한초록: 0~25%
                                    [0.50, '#00e887'],  // 초록:     25~50%
                                    [0.75, '#ff5c00'],  // 주황:     50~75%
                                    [1,    '#ff3b5c'],  // 빨강:     75~100%
                                ],
                            },
                        },
                        pointer: { // 바늘 스타일
                            show: true,
                            length:'30%',
                            width: compact ? 6 : 10,
                            icon: 'triangle',
                            offsetCenter: ['0%', '-20%'],
                            itemStyle: {
                                color: getRealColor(50),
                            },
                        },
                        axisTick: { // 바늘 위치 표시
                            show: true,
                            distance: compact ? 8 : 18,
                            length: compact ? 8 : 16,
                            lineStyle: {
                                color: 'rgba(255,255,255,0.25)',
                                width: 1,
                            },
                        },
                        splitLine: { // 게이지 구분선
                            show: true,
                            distance: compact ? 6 : 18,
                            length: compact ? 10 : 22,
                            lineStyle: {
                                color: 'auto',
                                // color: 'rgba(255,255,255,0.2)',
                                width: 2,
                            },
                        },
                        axisLabel: { // 게이지 라벨
                            show: false,
                        },
                        detail: { show: false },
                        data: [ // 게이지 데이터
                            {
                                value: 50,
                            },
                        ],
                        animation: true,
                        animationDuration: 0,
                        animationDurationUpdate: 0,
                    },
                ],
            };
            instanceRef.current.setOption(initialOption);
        }

        const total = longEnergy + shortEnergy;
        const shortRatio = total > 0 ? (shortEnergy / total) * 100 : prevRatioRef.current;
        prevRatioRef.current = shortRatio;
        realRatioRef.current = shortRatio;
        setLabelState({ text: shortRatio <= 50 ? 'Long' : 'Short', color: getRealColor(shortRatio) });

        instanceRef.current.setOption({
            series: [{
                data: [{ value: shortRatio }],
                animationDuration: 0,
                animationEasing: 'cubicInOut',
                pointer: { itemStyle: { color: getRealColor(shortRatio) } },
            }],
        });

        // 진동 타이머 — 에너지가 있을 때만 동작
        if (jitterTimerRef.current) clearInterval(jitterTimerRef.current);
        if (total > 0) {
            jitterTimerRef.current = setInterval(() => {
                if (!instanceRef.current) return;
                const noise = (Math.random() - 0.5) * 1;
                const jittered = Math.min(100, Math.max(0, realRatioRef.current + noise));
                instanceRef.current.setOption({
                    series: [{
                        data: [{ value: jittered }],
                        animationDuration: 0,
                        pointer: { itemStyle: { color: getRealColor(realRatioRef.current) } },
                    }],
                });
            }, 100);
        }
    }, [longEnergy, shortEnergy, compact]);

    useEffect(() => {
        return () => { if (jitterTimerRef.current) clearInterval(jitterTimerRef.current); };
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
            <div style={{
                position: 'absolute',
                top: '54%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: compact ? 13 : 16,
                fontWeight: 'bold',
                color: labelState.color,
                pointerEvents: 'none',
                fontFamily: "'Pretendard', sans-serif",
            }}>
                {labelState.text}
            </div>
        </div>
    );
}
