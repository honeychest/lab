// [AGENT] 알림 이력 테이블 (필터 + 페이징)
import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import styles from './AlertHistoryTable.module.css';

const fmt = (dt) => {
    if (!dt) return '-';
    const d = new Date(dt);
    return d.toLocaleString('ko-KR', { hour12: false });
};

export default function AlertHistoryTable() {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [type, setType] = useState('');
    const [page, setPage] = useState(0);
    const [data, setData] = useState(null);

    const params = useMemo(() => {
        const p = { page, size: 20 };
        if (from) p.from = from;
        if (to) p.to = to;
        if (type) p.type = type;
        return p;
    }, [from, to, type, page]);

    useEffect(() => {
        axios.get('/api/admin/monitor/alert-history', { params })
            .then(r => setData(r.data))
            .catch(() => setData({ content: [], totalPages: 0, totalElements: 0 }));
    }, [params]);

    const content = data?.content ?? [];

    return (
        <section className={styles.wrap}>
            <div className={styles.head}>
                <div className={styles.title}>알림 이력</div>
                <div className={styles.filters}>
                    <label className={styles.filterItem}>
                        <span>from</span>
                        <input type="date" value={from} onChange={(e) => { setPage(0); setFrom(e.target.value); }} />
                    </label>
                    <label className={styles.filterItem}>
                        <span>to</span>
                        <input type="date" value={to} onChange={(e) => { setPage(0); setTo(e.target.value); }} />
                    </label>
                    <label className={styles.filterItem}>
                        <span>type</span>
                        <select value={type} onChange={(e) => { setPage(0); setType(e.target.value); }}>
                            <option value="">전체</option>
                            <option value="CPU">CPU</option>
                            <option value="RAM">RAM</option>
                            <option value="DISK">DISK</option>
                            <option value="REDIS_QUEUE">REDIS_QUEUE</option>
                            <option value="API_ERROR">API_ERROR</option>
                        </select>
                    </label>
                </div>
            </div>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>발생시각</th>
                            <th>지표</th>
                            <th>현재값</th>
                            <th>임계값</th>
                            <th>지속</th>
                            <th>심각도</th>
                            <th>전송</th>
                        </tr>
                    </thead>
                    <tbody>
                        {content.length === 0 ? (
                            <tr>
                                <td colSpan={7} className={styles.empty}>알림 이력이 없습니다.</td>
                            </tr>
                        ) : content.map((row) => (
                            <tr key={row.id}>
                                <td>{fmt(row.sentAt)}</td>
                                <td className={styles.mono}>{row.metricType}</td>
                                <td className={styles.mono}>{row.value?.toFixed?.(1) ?? row.value}</td>
                                <td className={styles.mono}>{row.threshold?.toFixed?.(1) ?? row.threshold}</td>
                                <td className={styles.mono}>{Math.max(0, Math.ceil((row.durationSec ?? 0) / 60))}분</td>
                                <td>
                                    <span className={`${styles.sev} ${row.severity === 'CRITICAL' ? styles.critical : styles.warn}`}>
                                        {row.severity}
                                    </span>
                                </td>
                                <td className={styles.mono}>Y</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.pager}>
                <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page <= 0}>
                    이전
                </button>
                <span className={styles.pagerInfo}>
                    {page + 1} / {Math.max(1, data?.totalPages ?? 1)} (총 {data?.totalElements ?? 0})
                </span>
                <button
                    type="button"
                    onClick={() => setPage(p => p + 1)}
                    disabled={data != null && page + 1 >= (data.totalPages ?? 0)}
                >
                    다음
                </button>
            </div>
        </section>
    );
}

