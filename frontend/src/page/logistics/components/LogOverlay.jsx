import { useMemo, useRef, useState } from 'react';
import { formatLogTimestamp, isFailureEvent, summarizeEvent } from '../utils';

function getLogDomain(event) {
    const stage = event.payload?.stage;
    if (stage?.startsWith('OMS_')) return 'OMS';
    if (stage?.startsWith('WMS_') || stage?.startsWith('INBOUND_')) return 'WMS';
    if (stage?.startsWith('TMS_')) return 'TMS';

    const key = event.routingKey ?? event.eventType ?? '';
    if (key.startsWith('order.')) return 'OMS';
    if (key.startsWith('shipment.') || key.startsWith('inbound.')) return 'WMS';
    if (key.startsWith('dispatch.')) return 'TMS';
    if (key.startsWith('task.') && event.payload?.failureDomain) return event.payload.failureDomain;
    if (key.startsWith('audit.')) return 'AUDIT';
    return 'SYS';
}

export default function LogOverlay({
    logScope,
    logSnapshot,
    visibleEvents,
    onClose,
}) {
    const isFocusScope = logScope === 'focus';
    const [query, setQuery] = useState('');
    const [domainFilterDraft, setDomainFilterDraft] = useState('ALL');
    const [domainFilter, setDomainFilter] = useState('ALL');
    const [failureOnlyDraft, setFailureOnlyDraft] = useState(false);
    const [failureOnly, setFailureOnly] = useState(false);
    const [filterPending, setFilterPending] = useState(false);
    const searchInputRef = useRef(null);
    const filterTimerRef = useRef(null);
    const normalizedQuery = query.trim().toLowerCase();
    const applyFilters = (nextDomainFilter, nextFailureOnly) => {
        if (filterTimerRef.current) window.clearTimeout(filterTimerRef.current);
        setFilterPending(true);
        filterTimerRef.current = window.setTimeout(() => {
            setDomainFilter(nextDomainFilter);
            setFailureOnly(nextFailureOnly);
            setFilterPending(false);
            filterTimerRef.current = null;
        }, 60);
    };
    const filteredEvents = useMemo(() => {
        if (isFocusScope) return visibleEvents;
        return visibleEvents.filter(event => {
            if (domainFilter !== 'ALL' && getLogDomain(event) !== domainFilter) return false;
            if (failureOnly && !isFailureEvent(event)) return false;
            if (!normalizedQuery) return true;
            return String(event.aggregateId ?? '').toLowerCase().includes(normalizedQuery);
        });
    }, [domainFilter, failureOnly, isFocusScope, normalizedQuery, visibleEvents]);
    const contextEvent = filteredEvents[filteredEvents.length - 1] ?? filteredEvents[0] ?? null;
    const titleKey = isFocusScope ? (logSnapshot.focusedTaskId ?? '선택 없음') : '전체 Task';
    const titleMeta = [
        isFocusScope ? '포커스 로그' : '전체 로그',
        `Actor ${isFocusScope ? (contextEvent?.actor ?? '-') : 'multiple'}`,
        `Trace ${isFocusScope ? (contextEvent?.correlationId?.slice(0, 8) ?? '-') : 'multiple'}`,
        `${filteredEvents.length}건`,
    ];

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'var(--dark-overlay-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={filterPending ? undefined : onClose}>
            <div className="logistics-side-section logistics-log-overlay-card" style={{ background: 'var(--dark-modal-bg)' }}
                onClick={event => event.stopPropagation()}>
                <div className="logistics-log-overlay-header">
                    <div className="logistics-log-title">
                        <strong>{titleKey}</strong>
                        <div>
                            {titleMeta.map((item, index) => (
                                <span key={`${item}-${index}`}>{item}</span>
                            ))}
                        </div>
                    </div>
                </div>
                {!isFocusScope && (
                    <div className="logistics-log-search">
                        <div className="logistics-log-domain-filter">
                            {['ALL', 'OMS', 'WMS', 'TMS'].map(domain => (
                                <button
                                    key={domain}
                                    type="button"
                                    className={domainFilterDraft === domain ? 'is-active' : ''}
                                    onClick={() => {
                                        setDomainFilterDraft(domain);
                                        applyFilters(domain, failureOnlyDraft);
                                    }}
                                >
                                    {domain === 'ALL' ? '전체' : domain}
                                </button>
                            ))}
                            <button
                                type="button"
                                className={failureOnlyDraft ? 'is-active is-failure-filter' : 'is-failure-filter'}
                                onClick={() => {
                                    const nextFailureOnly = !failureOnlyDraft;
                                    setFailureOnlyDraft(nextFailureOnly);
                                    applyFilters(domainFilterDraft, nextFailureOnly);
                                }}
                            >
                                실패
                            </button>
                        </div>
                        <div className="logistics-log-search-field">
                            <input
                                ref={searchInputRef}
                                onKeyDown={event => {
                                    if (event.key === 'Enter') setQuery(event.currentTarget.value);
                                }}
                                placeholder="Task key 검색"
                                autoFocus
                            />
                            <button
                                type="button"
                                aria-label="검색어 삭제"
                                onClick={() => {
                                    if (searchInputRef.current) searchInputRef.current.value = '';
                                    setQuery('');
                                }}
                            >
                                ×
                            </button>
                        </div>
                        <button
                            type="button"
                            className="logistics-outline-btn"
                            onClick={() => setQuery(searchInputRef.current?.value ?? '')}
                        >
                            검색
                        </button>
                    </div>
                )}
                <div className="logistics-log-list">
                    {filteredEvents.length > 0 ? filteredEvents.slice().reverse().map(event => {
                        const domain = getLogDomain(event);
                        const failed = isFailureEvent(event);
                        return (
                        <div key={event.eventId} className={`logistics-log-row${failed ? ' is-failure' : ''}`}>
                            <div className="logistics-log-row-main">
                                <span className={`logistics-log-domain domain-${domain.toLowerCase()}`}>{domain}</span>
                                <div className="logistics-log-row-content">
                                    <div className="logistics-log-row-top">
                                        <span className="logistics-log-key">
                                            {!isFocusScope && <span className="logistics-log-task-key">{event.aggregateId}</span>}
                                            {summarizeEvent(event)}
                                        </span>
                                        <span className="logistics-log-time">{formatLogTimestamp(event.timestamp)}</span>
                                    </div>
                                    <div className="logistics-log-row-summary">{event.routingKey}</div>
                                </div>
                            </div>
                        </div>
                        );
                    }) : (
                        <div className="logistics-empty-card">
                            {isFocusScope
                                ? '포커스 task 이력이 없습니다. 작업을 선택한 뒤 다시 확인하세요.'
                                : normalizedQuery
                                    ? '검색 결과가 없습니다.'
                                    : '표시할 이벤트가 없습니다.'}
                        </div>
                    )}
                </div>
                <div className="logistics-button-row logistics-log-footer">
                    <button className="logistics-outline-btn" onClick={onClose}>닫기</button>
                </div>
                {filterPending && (
                    <div className="logistics-log-loading-layer" aria-live="polite" aria-busy="true">
                        <span>Loading</span>
                    </div>
                )}
            </div>
        </div>
    );
}
