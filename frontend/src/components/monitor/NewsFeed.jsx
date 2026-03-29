// [AGENT] 뉴스피드 카드 (사이드바 하단, PC 전용) — /api/news fetch
// 에러 시 3초마다 재시도, 5회 실패 시 중단
// 읽은 뉴스: localStorage 저장 (24시간 TTL), 회색 표시
import { useEffect, useRef, useState } from 'react';
import apiClient from '@/api/apiClient.js';
import styles from './NewsFeed.module.css';

const BADGE_CLASS = { '경제': styles.badgeEco, 'IT': styles.badgeIt, '인기': styles.badgeHot, '최신': styles.badgeLatest };
const MAX_RETRY = 5;
const RETRY_INTERVAL = 3000;
const REFRESH_INTERVAL = 5 * 60 * 1000;
const READ_STORAGE_KEY = 'newsfeed_read';
const READ_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

function fmtAgo(publishedAt) {
    if (!publishedAt) return '--';
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

// 읽은 뉴스 링크 목록 로드 (만료된 항목 제거)
function loadReadLinks() {
    try {
        const raw = localStorage.getItem(READ_STORAGE_KEY);
        if (!raw) return {};
        const data = JSON.parse(raw);
        const now = Date.now();
        const cleaned = Object.fromEntries(
            Object.entries(data).filter(([, ts]) => now - ts < READ_TTL_MS)
        );
        return cleaned;
    } catch {
        return {};
    }
}

// 뉴스 링크를 읽음으로 저장
function markAsRead(link) {
    try {
        const data = loadReadLinks();
        data[link] = Date.now();
        localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(data));
    } catch {
        // localStorage 접근 불가 환경 무시
    }
}

// URL 보안: http/https 스킴만 허용
function openSafeLink(link) {
    if (/^https?:\/\//.test(link)) {
        window.open(link, '_blank', 'noopener,noreferrer');
    }
}

export default function NewsFeed() {
    const [items, setItems]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [failed, setFailed]     = useState(false);
    const [readLinks, setReadLinks] = useState(() => loadReadLinks());
    const retryCount              = useRef(0);
    const retryTimer              = useRef(null);
    const cancelled               = useRef(false);

    useEffect(() => {
        cancelled.current = false;

        const load = () => {
            setLoading(true);
            apiClient.get('/api/news')
                .then(res => {
                    if (cancelled.current) return;
                    setItems(Array.isArray(res.data) ? res.data : []);
                    setLoading(false);
                    setFailed(false);
                    retryCount.current = 0;
                    // 성공 후 5분마다 갱신
                    retryTimer.current = window.setTimeout(load, REFRESH_INTERVAL);
                })
                .catch(err => {
                    if (cancelled.current) return;
                    console.warn('[NewsFeed] 뉴스 로드 실패', err?.message);
                    retryCount.current += 1;
                    if (retryCount.current >= MAX_RETRY) {
                        setLoading(false);
                        setFailed(true);
                        return;
                    }
                    // 실패 시 3초 후 재시도
                    retryTimer.current = window.setTimeout(load, RETRY_INTERVAL);
                });
        };

        load();
        return () => {
            cancelled.current = true;
            window.clearTimeout(retryTimer.current);
        };
    }, []);

    const handleClick = (link) => {
        markAsRead(link);
        setReadLinks(loadReadLinks());
        openSafeLink(link);
    };

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <span className={styles.title}>뉴스</span>
                <span className={styles.hint}>경제 · IT · 인기</span>
            </div>

            {failed ? (
                <div className={styles.empty}>뉴스를 불러올 수 없습니다.</div>
            ) : loading && items.length === 0 ? (
                <div className={styles.spinnerWrap}>
                    <div className={styles.spinner} />
                </div>
            ) : items.length === 0 ? (
                <div className={styles.empty}>뉴스가 없습니다.</div>
            ) : (
                <ul className={styles.list}>
                    {items.map((item, i) => {
                        const isRead = !!readLinks[item.link];
                        return (
                            <li key={item.link ?? i}>
                                <div
                                    role="link"
                                    tabIndex={0}
                                    onClick={() => handleClick(item.link)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleClick(item.link); }}
                                    className={`${styles.item} ${isRead ? styles.itemRead : ''}`}
                                >
                                    <div className={styles.meta}>
                                        <span className={`${styles.badge} ${BADGE_CLASS[item.category] ?? ''}`}>{item.category}</span>
                                        <span className={styles.source}>{item.source}</span>
                                        <span className={styles.ago}>{fmtAgo(item.publishedAt)}</span>
                                    </div>
                                    <div className={styles.itemTitle}>{item.title}</div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
