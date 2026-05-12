import styles from './TradePage.module.css';
import { formatThreshold } from './model/tradeDisplayModel.js';

function TradeScanSlot({ scanSlotView, threshold, variant = 'desktop' }) {
    const isMobile = variant === 'mobile';
    const frameClassName = isMobile
        ? `relative overflow-hidden rounded-xl border flex items-center justify-center px-4 h-10 transition-colors duration-500 ${
            scanSlotView.isExpanding ? 'bg-blue-950/30 border-blue-500/30' : 'bg-[var(--dark-card-bg)] border-[var(--dark-border)]'
        }`
        : `relative overflow-hidden border-b border-[var(--dark-border)] flex items-center justify-center px-4 h-10 flex-shrink-0 transition-colors duration-500 ${
            scanSlotView.isExpanding ? 'bg-blue-950/30' : 'bg-[var(--dark-bg)]'
        }`;

    return (
        <div className={frameClassName}>
            {scanSlotView.isReconnecting ? (
                <span className="text-xs text-yellow-400 font-mono">{scanSlotView.label}</span>
            ) : (
                <>
                    <span className="text-xs text-[var(--dark-text-secondary)] font-mono tracking-widest select-none">
                        {scanSlotView.label}
                    </span>
                    {scanSlotView.showThreshold && (
                        <>
                            <span className="text-xs text-[var(--dark-text-secondary)] font-mono tracking-widest ml-2 select-none"> {formatThreshold(threshold)} 이상</span>
                            {scanSlotView.showBeam && (
                                <div
                                    className={`absolute inset-0 w-1/4 bg-gradient-to-r from-transparent via-blue-400/15 to-transparent pointer-events-none ${styles.scanBeam}`}
                                />
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

export default TradeScanSlot;
