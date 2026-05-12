import BinanceWallet from '../../../domain/binance/ui/wallet/BinanceWallet.tsx';

function BinanceWalletCard({
    accountInfo,
    walletLoading,
    walletError,
}) {
    return (
        <div style={{
            background: 'var(--dark-card-bg)',
            border: '1px solid var(--dark-border)',
            borderRadius: '16px',
            padding: '24px',
        }}>
            <BinanceWallet
                accountInfo={accountInfo}
                loading={walletLoading}
                error={walletError}
            />
        </div>
    );
}

export default BinanceWalletCard;
