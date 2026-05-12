import { getBinanceExchangePairLabel } from '../model/binancePageView.js';

function BinancePageHeader() {
    const label = getBinanceExchangePairLabel();

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
        }}>
            <span style={{ color: 'var(--dark-text-secondary)', fontSize: '11px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--dark-accent-gold)', fontWeight: 800, fontSize: '20px' }}>
                    {label.left}
                </span>
                <span style={{ color: 'var(--dark-text-secondary)', fontSize: '20px', fontWeight: 300 }}>
                    {label.separator}
                </span>
                <span style={{ color: 'var(--dark-accent)', fontWeight: 800, fontSize: '20px' }}>
                    {label.right}
                </span>
            </div>
        </div>
    );
}

export default BinancePageHeader;
