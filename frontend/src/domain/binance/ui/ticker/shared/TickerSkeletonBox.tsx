import React from 'react';
import {
    buildTickerSkeletonKeyframes,
    getTickerSkeletonAnimationName,
} from './tickerSkeleton.js';

type TickerSkeletonBoxProps = {
    width?: string;
    height?: string;
    borderRadius?: string;
    style?: React.CSSProperties;
    variant?: 'desktop' | 'mobile';
    injectKeyframes?: boolean;
};

function TickerSkeletonBox({
    width = '100%',
    height = '16px',
    borderRadius = '6px',
    style,
    variant = 'desktop',
    injectKeyframes = false,
}: TickerSkeletonBoxProps) {
    const animationName = getTickerSkeletonAnimationName(variant);

    return (
        <>
            {injectKeyframes && <style>{buildTickerSkeletonKeyframes(variant)}</style>}
            <div style={{
                width,
                height,
                borderRadius,
                background: 'linear-gradient(90deg, var(--dark-border) 25%, #2d3f52 50%, var(--dark-border) 75%)',
                backgroundSize: '200% 100%',
                animation: `${animationName} 1.5s infinite linear`,
                ...style,
            }} />
        </>
    );
}

export default TickerSkeletonBox;
