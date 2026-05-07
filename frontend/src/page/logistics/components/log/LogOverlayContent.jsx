import { formatLogTimestamp, isFailureEvent, summarizeEvent } from '../../utils';
import { getLogDomain } from './logDomain';

const LOG_DOMAINS = ['ALL', 'OMS', 'WMS', 'TMS'];

function LogOverlayHeader({ titleKey, titleMeta }) {
    return (
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
    );
}

function LogSearchBar({
    searchInputRef,
    domainFilterDraft,
    failureOnlyDraft,
    onDomainFilterChange,
    onFailureOnlyToggle,
    onQueryApply,
    onQueryClear,
}) {
    return (
        <div className="logistics-log-search">
            <div className="logistics-log-domain-filter">
                {LOG_DOMAINS.map(domain => (
                    <button
                        key={domain}
                        type="button"
                        className={domainFilterDraft === domain ? 'is-active' : ''}
                        onClick={() => onDomainFilterChange(domain)}
                    >
                        {domain === 'ALL' ? '전체' : domain}
                    </button>
                ))}
                <button
                    type="button"
                    className={failureOnlyDraft ? 'is-active is-failure-filter' : 'is-failure-filter'}
                    onClick={onFailureOnlyToggle}
                >
                    실패
                </button>
            </div>
            <div className="logistics-log-search-field">
                <input
                    ref={searchInputRef}
                    onKeyDown={event => {
                        if (event.key === 'Enter') onQueryApply(event.currentTarget.value);
                    }}
                    placeholder="Task key 검색"
                    autoFocus
                />
                <button
                    type="button"
                    aria-label="검색어 삭제"
                    onClick={onQueryClear}
                >
                    ×
                </button>
            </div>
            <button
                type="button"
                className="logistics-outline-btn"
                onClick={() => onQueryApply(searchInputRef.current?.value ?? '')}
            >
                검색
            </button>
        </div>
    );
}

function LogEventRow({ event, isFocusScope, onEventSelect }) {
    const domain = getLogDomain(event);
    const failed = isFailureEvent(event);

    return (
        <button
            key={event.eventId}
            type="button"
            className={`logistics-log-row${failed ? ' is-failure' : ''}${onEventSelect ? ' is-selectable' : ''}`}
            onClick={() => onEventSelect?.(event)}
        >
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
        </button>
    );
}

function EmptyLogCard({ isFocusScope, normalizedQuery }) {
    return (
        <div className="logistics-empty-card">
            {isFocusScope
                ? '포커스 task 이력이 없습니다. 작업을 선택한 뒤 다시 확인하세요.'
                : normalizedQuery
                    ? '검색 결과가 없습니다.'
                    : '표시할 이벤트가 없습니다.'}
        </div>
    );
}

function LogEventList({ filteredEvents, isFocusScope, normalizedQuery, onEventSelect }) {
    return (
        <div className="logistics-log-list">
            {filteredEvents.length > 0 ? filteredEvents.slice().reverse().map(event => (
                <LogEventRow
                    key={event.eventId}
                    event={event}
                    isFocusScope={isFocusScope}
                    onEventSelect={onEventSelect}
                />
            )) : (
                <EmptyLogCard
                    isFocusScope={isFocusScope}
                    normalizedQuery={normalizedQuery}
                />
            )}
        </div>
    );
}

export default function LogOverlayContent({
    isFocusScope,
    titleKey,
    titleMeta,
    filteredEvents,
    normalizedQuery,
    filterPending,
    searchInputRef,
    domainFilterDraft,
    failureOnlyDraft,
    onClose,
    onDomainFilterChange,
    onFailureOnlyToggle,
    onQueryApply,
    onQueryClear,
    onEventSelect,
}) {
    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'var(--dark-overlay-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 100,
            }}
            onClick={filterPending ? undefined : onClose}
        >
            <div
                className="logistics-side-section logistics-log-overlay-card"
                style={{ background: 'var(--dark-modal-bg)' }}
                onClick={event => event.stopPropagation()}
            >
                <LogOverlayHeader
                    titleKey={titleKey}
                    titleMeta={titleMeta}
                />
                {!isFocusScope && (
                    <LogSearchBar
                        searchInputRef={searchInputRef}
                        domainFilterDraft={domainFilterDraft}
                        failureOnlyDraft={failureOnlyDraft}
                        onDomainFilterChange={onDomainFilterChange}
                        onFailureOnlyToggle={onFailureOnlyToggle}
                        onQueryApply={onQueryApply}
                        onQueryClear={onQueryClear}
                    />
                )}
                <LogEventList
                    filteredEvents={filteredEvents}
                    isFocusScope={isFocusScope}
                    normalizedQuery={normalizedQuery}
                    onEventSelect={onEventSelect}
                />
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
