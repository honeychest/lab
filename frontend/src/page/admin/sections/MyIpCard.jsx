import styles from '../AdminPage.module.css';

export default function MyIpCard({ myIp }) {
    if (!myIp) return null;
    return (
        <div className={styles.card} style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--monitor-gauge-ok)', boxShadow: '0 0 0 0 rgba(16,185,129,0.45)', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontWeight: 900, fontSize: '13px', color: 'var(--monitor-text-primary)' }}>접속 정보</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px dashed rgba(17,24,39,0.10)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--monitor-text-secondary)' }}>IP</span>
                    <span className={styles.mono} style={{ fontSize: '12px', fontWeight: 900, color: 'var(--monitor-gauge-ok)' }}>{myIp.ip}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px dashed rgba(17,24,39,0.10)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, color: 'var(--monitor-text-secondary)' }}>remoteAddr</span>
                    <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--monitor-text-primary)' }}>{myIp.remoteAddr}</span>
                </div>
            </div>
        </div>
    );
}
