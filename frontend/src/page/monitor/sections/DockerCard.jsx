import styles from '../MonitorPage.module.css';
import { fmtCount, fmtMem } from '../utils/formatters.js';

function DockerContainersTable({ containers }) {
    if (containers.length === 0) {
        return <div className={styles.dockerEmpty}>표시할 컨테이너 정보가 없습니다.</div>;
    }
    return (
        <div className={styles.dockerTable} role="table" aria-label="Docker 컨테이너 상태">
            <div className={`${styles.dockerRow} ${styles.dockerHead}`} role="row">
                <div className={styles.dockerColName} role="columnheader">이름</div>
                <div className={styles.dockerColImage} role="columnheader">이미지</div>
                <div className={styles.dockerColCpu} role="columnheader">CPU</div>
                <div className={styles.dockerColMem} role="columnheader">MEM</div>
                <div className={styles.dockerColStatus} role="columnheader">상태</div>
                <div className={styles.dockerColUptime} role="columnheader">Uptime</div>
                <div className={styles.dockerColRestarts} role="columnheader">재시작</div>
            </div>
            {containers.map((c) => {
                const status = (c?.status ?? '').toString();
                const bad = status.toLowerCase() !== 'running';
                const up = c?.uptimeSec == null ? '--' : (c.uptimeSec < 60 ? `${c.uptimeSec}s` : `${Math.floor(c.uptimeSec / 60)}m`);
                const cpu = c?.cpuPercent == null ? '--' : `${c.cpuPercent.toFixed(1)}%`;
                const mem = fmtMem(c?.memUsedBytes, c?.memLimitBytes);
                return (
                    <div key={c?.name ?? status} className={styles.dockerRow} role="row">
                        <div className={`${styles.dockerColName} ${styles.mono}`} role="cell">{c?.name ?? '--'}</div>
                        <div className={`${styles.dockerColImage} ${styles.mono}`} role="cell">{c?.image ?? '--'}</div>
                        <div className={`${styles.dockerColCpu} ${styles.mono}`} role="cell">{cpu}</div>
                        <div className={`${styles.dockerColMem} ${styles.mono}`} role="cell">{mem}</div>
                        <div className={styles.dockerColStatus} role="cell">
                            <span className={`${styles.dockerBadge} ${bad ? styles.dockerBadgeBad : styles.dockerBadgeOk}`}>
                                {status || '--'}
                            </span>
                        </div>
                        <div className={`${styles.dockerColUptime} ${styles.mono}`} role="cell">{up}</div>
                        <div className={`${styles.dockerColRestarts} ${styles.mono}`} role="cell">
                            {c?.restarts == null ? '--' : c.restarts}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function RedisKeysPreview({ redisKeys, redisQueue }) {
    if (redisKeys.length === 0) {
        return <div className={styles.dockerEmpty}>표시할 키가 없습니다.</div>;
    }
    const serverLeader = redisKeys.find(x => x?.key === 'server:leader');
    const maxQueue = redisKeys.find(x => x?.key === 'config:aggtrade:max-queue-size')?.value;
    const maxQueueNum = Number(maxQueue);
    const q = Number(redisQueue);
    const pct = (Number.isFinite(q) && Number.isFinite(maxQueueNum) && maxQueueNum > 0)
        ? Math.min(100, Math.max(0, (q / maxQueueNum) * 100))
        : null;

    return (
        <div className={styles.dockerTable} role="table" aria-label="Redis 키 미리보기">
            <div className={`${styles.dockerRow} ${styles.dockerHead} ${styles.redisRow}`} role="row">
                <div className={styles.redisColKey} role="columnheader">Key</div>
                <div className={styles.redisColValue} role="columnheader">Value</div>
            </div>

            <div className={`${styles.dockerRow} ${styles.redisRow}`} role="row">
                <div className={`${styles.redisColKey} ${styles.mono}`} role="cell">server:leader</div>
                <div className={styles.redisColValue} role="cell">
                    <div className={styles.redisValueBox}>
                        {serverLeader?.value ?? '—'}
                    </div>
                </div>
            </div>

            <div className={`${styles.dockerRow} ${styles.redisRow}`} role="row">
                <div className={`${styles.redisColKey} ${styles.mono}`} role="cell">aggtrade queue</div>
                <div className={styles.redisColValue} role="cell">
                    <div className={styles.redisValueBox}>
                        {Number.isFinite(q) ? fmtCount(q) : '—'}
                        {Number.isFinite(maxQueueNum) ? ` / ${fmtCount(maxQueueNum)}` : ''}
                        {pct == null ? '' : ` (${pct.toFixed(1)}%)`}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function DockerCard({ containers, anyContainerBad, dockerSummary, redisKeys, redisQueue }) {
    return (
        <section className={styles.dockerCard}>
            <div className={styles.dockerHeader}>
                <div className={styles.dockerTitle}>
                    Docker <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>(Swap memory 8 GB)</span>
                </div>
                <div className={`${styles.dockerStatus} ${anyContainerBad ? styles.dockerStatusBad : styles.dockerStatusOk}`}>
                    {dockerSummary}
                </div>
            </div>

            <DockerContainersTable containers={containers} />

            <div className={styles.dockerDivider} />

            <div className={styles.dockerSubHeader}>
                <div className={styles.dockerSubTitle}>Redis</div>
                <div className={styles.dockerSubHint}>Key / Value</div>
            </div>

            <RedisKeysPreview redisKeys={redisKeys} redisQueue={redisQueue} />
        </section>
    );
}
