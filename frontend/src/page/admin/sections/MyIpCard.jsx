import shared from '../AdminPage.module.css';
import s from './MyIpCard.module.css';

export default function MyIpCard({ myIp }) {
    const { myIp: ipInfo, loggingOut, handleLogout } = myIp;

    if (!ipInfo) return null;

    return (
        <div className={`${shared.card} ${s.cardCompact}`}>
            <div className={s.header}>
                <span className={s.statusDot} />
                <span className={s.title}>접속 정보</span>
                <button
                    type="button"
                    className={`${shared.btn} ${shared.btnSm} ${shared.pushRight}`}
                    onClick={handleLogout}
                    disabled={loggingOut}
                >
                    {loggingOut ? '처리 중…' : '로그아웃'}
                </button>
            </div>
            <div className={s.list}>
                <div className={s.row}>
                    <span className={s.rowLabel}>IP</span>
                    <span className={`${shared.mono} ${s.rowValueOk}`}>{ipInfo.ip}</span>
                </div>
                <div className={s.row}>
                    <span className={s.rowLabel}>remoteAddr</span>
                    <span className={`${shared.mono} ${s.rowValue}`}>{ipInfo.remoteAddr}</span>
                </div>
            </div>
        </div>
    );
}
