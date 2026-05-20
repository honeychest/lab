import shared from '../AdminPage.module.css';
import s from './AllowedIpsCard.module.css';
import { fmtTtl } from '../utils';

export default function AllowedIpsCard({ allowed }) {
    const { allowedIps, allowedLoading, allowedError, loadAllowedIps, handleDeleteAllowedIp } = allowed;
    return (
        <div className={shared.card}>
            <div className={shared.titleRow}>
                <div className={shared.title}>허용 IP</div>
                <button
                    type="button"
                    className={`${shared.btn} ${shared.btnActive} ${shared.pushRight}`}
                    onClick={loadAllowedIps}
                    disabled={allowedLoading}
                >
                    {allowedLoading ? '새로고침 중...' : '새로고침'}
                </button>
            </div>
            {allowedError && (
                <div className={`${shared.muted} ${shared.error}`}>{allowedError}</div>
            )}
            {!allowedLoading && !allowedError && allowedIps.length === 0 && (
                <div className={shared.muted}>현재 허용된 IP가 없습니다.</div>
            )}
            {!allowedLoading && allowedIps.length > 0 && (
                <ul className={s.ipList}>
                    {allowedIps.map((x) => (
                        <li key={x.ip} className={s.ipItem}>
                            <div className={s.ipLeft}>
                                <div className={s.ip}>{x.ip}</div>
                                <div className={s.ttl}>잔여: {fmtTtl(x.ttlSeconds)}</div>
                            </div>
                            <button
                                type="button"
                                className={s.del}
                                onClick={() => handleDeleteAllowedIp(x.ip)}
                                disabled={allowedLoading}
                            >
                                삭제
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
