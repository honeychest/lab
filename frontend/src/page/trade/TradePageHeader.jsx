import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/shared/ui/shadcn/input-otp.js';
import { Button } from '@/shared/ui/shadcn/button';

function TradePageHeader({ symbol, onOpenPanel }) {
    return (
        <div className="relative flex items-center justify-center mb-4">
            <div className="pointer-events-none select-none">
                <InputOTP maxLength={symbol.length} value={symbol} readOnly>
                    <InputOTPGroup>
                        {Array.from(symbol).map((_, i) => (
                            <InputOTPSlot
                                key={i}
                                index={i}
                                className="h-12 w-12 text-xl font-bold font-mono text-[var(--dark-accent-gold)] border-[var(--dark-btn-bg)] bg-transparent data-[active=true]:ring-0 data-[active=true]:border-[var(--dark-btn-bg)] data-[active=true]:shadow-none"
                            />
                        ))}
                    </InputOTPGroup>
                </InputOTP>
            </div>
            <Button
                id="btn-open-panel"
                data-testid="btn-open-panel"
                variant="ghost"
                size="sm"
                onClick={onOpenPanel}
                className="absolute right-0 bg-transparent text-xs text-[var(--dark-text-secondary)] hover:text-[var(--dark-text-neutral)] border border-[var(--dark-btn-bg)] rounded px-3 py-1.5 transition-colors h-auto"
            >
                조회
            </Button>
        </div>
    );
}

export default TradePageHeader;
