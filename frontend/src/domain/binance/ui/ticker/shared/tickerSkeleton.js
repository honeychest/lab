export function getTickerSkeletonAnimationName(variant) {
    return variant === 'mobile' ? 'shimmerMobile' : 'shimmer';
}

export function buildTickerSkeletonKeyframes(variant) {
    const name = getTickerSkeletonAnimationName(variant);
    return `
@keyframes ${name} {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
}
`;
}
