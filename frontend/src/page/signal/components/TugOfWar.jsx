// [AGENT] Signal Dashboard TugOfWar — 줄다리기 애니메이션
import { useMemo } from 'react';

export default function TugOfWar({ longEnergy, shortEnergy }) {
    const centerPos = useMemo(() => {
        const total = longEnergy + shortEnergy;
        if (total === 0) return 50;
        return (shortEnergy / total) * 100;
    }, [longEnergy, shortEnergy]);

    const longGlow = useMemo(() => {
        const total = longEnergy + shortEnergy;
        if (total === 0) return 0;
        const ratio = longEnergy / total;
        return ratio > 0.5 ? (ratio - 0.5) * 2 : 0;
    }, [longEnergy, shortEnergy]);

    const shortGlow = useMemo(() => {
        const total = longEnergy + shortEnergy;
        if (total === 0) return 0;
        const ratio = shortEnergy / total;
        return ratio > 0.5 ? (ratio - 0.5) * 2 : 0;
    }, [longEnergy, shortEnergy]);

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '4px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '160px',
                height: '20px',
            }}
        >
            <style>{`
                @keyframes leftNodePulse {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-3px); }
                }
                @keyframes rightNodePulse {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(3px); }
                }
                @keyframes centerVibrate {
                    0%, 100% { transform: translate(-50%, -50%) translateX(0); }
                    50% { transform: translate(-50%, -50%) translateX(1.6px); }
                }
                @keyframes tensionFade {
                    0%, 100% { opacity: 0.28; }
                    50% { opacity: 0.08; }
                }
            `}</style>

            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    width: '100%',
                    height: '5px',
                    background: 'linear-gradient(90deg, rgba(0,232,135,0.3) 0%, var(--black-border-strong) 50%, rgba(255,59,92,0.3) 100%)',
                    transform: 'translateY(-50%)',
                }}
            />

            <div
                style={{
                    position: 'absolute',
                    top: '26%',
                    left: '0',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--black-long)',
                    boxShadow: `0 0 ${8 + longGlow * 12}px rgba(0,232,135,${0.4 + longGlow * 0.4})`,
                    transform: 'translate(-50%, -50%)',
                    animation: 'leftNodePulse 4s ease-in-out infinite',
                }}
            />

            <div
                style={{
                    position: 'absolute',
                    top: '26%',
                    right: '0',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--black-short)',
                    boxShadow: `0 0 ${8 + shortGlow * 12}px rgba(255,59,92,${0.4 + shortGlow * 0.4})`,
                    transform: 'translate(50%, -50%)',
                    animation: 'rightNodePulse 4s ease-in-out infinite',
                }}
            />

            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: `${centerPos}%`,
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--black-text-secondary)',
                    boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                    transform: 'translate(-50%, -50%)',
                    animation: 'centerVibrate 0.12s linear infinite',
                    transition: 'left 0.8s ease-in-out',
                }}
            />

            {[25, 40, 60, 75].map((pos, idx) => (
                <div
                    key={idx}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: `${pos}%`,
                        width: '2px',
                        height: '6px',
                        backgroundColor: 'rgba(255,255,255,0.18)',
                        transform: 'translate(-50%, -50%)',
                        animation: 'tensionFade 2.5s ease infinite',
                        animationDelay: `${idx * 0.2}s`,
                    }}
                />
            ))}
        </div>
    );
}
