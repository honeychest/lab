export function getCoinTabTone(active) {
    return active
        ? {
            border: '1px solid var(--dark-accent-gold)',
            background: 'var(--dark-accent-gold)',
            color: '#000000',
            outline: '2px solid var(--dark-accent-gold)',
        }
        : {
            border: '1px solid var(--dark-border)',
            background: 'transparent',
            color: 'var(--dark-text-primary)',
            outline: 'none',
        };
}
