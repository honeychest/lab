// [AGENT] 뉴스피드 카드 (사이드바 하단, PC 전용) — /api/news fetch
import { useEffect, useState } from 'react';
import axios from 'axios';
import styles from './NewsFeed.module.css';

const BADGE_CLASS = { '경제': styles.badgeEco, 'IT': styles.badgeIt, '인기': styles.badgeHot, '최신': styles.badgeLatest };

function fmtAgo(publishedAt) {
    if (!publishedAt) return '--';
    // LocalDateTime 배열([y,m,d,h,mm,ss]) 또는 문자열 모두 처리
    let d;
    if (Array.isArray(publishedAt) && publishedAt.length >= 5) {
        const [y, m, day, hh, mm] = publishedAt;
        d = new Date(y, m - 1, day, hh, mm);
    } else {
        d = new Date(publishedAt);
    }
    if (isNaN(d.getTime())) return '--';
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return `${sec}초 전`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    return `${Math.floor(min / 60)}시간 전`;
}

export default function NewsFeed() {
    const [items, setItems] = useState([]);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const load = () => {
            axios.get('/api/news')
                .then(res => { if (!cancelled) { setItems(res.data); setError(false); } })
                .catch(() => { if (!cancelled) setError(true); });
        };

        load();
        // 5분마다 재조회 (백엔드 캐시 갱신 주기와 맞춤)
        const id = window.setInterval(load, 5 * 60 * 1000);
        return () => { cancelled = true; window.clearInterval(id); };
    }, []);

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <span className={styles.title}>뉴스</span>
                <span className={styles.hint}>경제 · IT · 인기</span>
            </div>

            {error ? (
                <div className={styles.empty}>뉴스를 불러올 수 없습니다.</div>
            ) : items.length === 0 ? (
                <div className={styles.empty}>수집 중...</div>
            ) : (
                <ul className={styles.list}>
                    {items.map((item, i) => (
                        <li key={item.link ?? i}>
                            <div onClick={() => window.open(item.link, '_blank', 'noopener,noreferrer')} className={styles.item}>
                                <div className={styles.meta}>
                                    <span className={`${styles.badge} ${BADGE_CLASS[item.category] ?? ''}`}>{item.category}</span>
                                    <span className={styles.source}>{item.source}</span>
                                    <span className={styles.ago}>{fmtAgo(item.publishedAt)}</span>
                                </div>
                                <div className={styles.itemTitle}>{item.title}</div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
