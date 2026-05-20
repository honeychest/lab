import styles from '../AdminPage.module.css';

export default function FeatureFlagsCard({ flags, flagsLoading, patchFlags }) {
    return (
        <div className={styles.card}>
            <div className={styles.titleRow}>
                <div className={styles.title}>Feature Flags</div>
                <div className={styles.subtitle}>Redis 저장</div>
            </div>
            {flagsLoading ? (
                <div className={styles.muted}>불러오는 중...</div>
            ) : (
                <div className={styles.flexColGap}>
                    <label className={styles.flagRow}>
                        <span className={styles.flagLabel}>Trade 임계값 변경 UI</span>
                        <input
                            type="checkbox"
                            checked={!!flags.tradeThresholdEdit}
                            onChange={(e) => patchFlags({ ...flags, tradeThresholdEdit: e.target.checked })}
                        />
                    </label>
                    <label className={styles.flagRow}>
                        <span className={styles.flagLabel}>Monitor 허용 IP 관리</span>
                        <input
                            type="checkbox"
                            checked={!!flags.monitorAllowedIpManage}
                            onChange={(e) => patchFlags({ ...flags, monitorAllowedIpManage: e.target.checked })}
                        />
                    </label>
                    <div className={styles.desc}>
                        추후 페이지 단위 차단도 이 방식으로 확장 가능합니다.
                    </div>
                </div>
            )}
        </div>
    );
}
