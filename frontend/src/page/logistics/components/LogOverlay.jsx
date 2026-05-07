import { useMemo, useRef, useState } from 'react';
import { isFailureEvent } from '../utils';
import LogOverlayContent from './log/LogOverlayContent';
import { getLogDomain } from './log/logDomain';

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
    const handleDomainFilterChange = (domain) => {
        setDomainFilterDraft(domain);
        applyFilters(domain, failureOnlyDraft);
    };
    const handleFailureOnlyToggle = () => {
        const nextFailureOnly = !failureOnlyDraft;
        setFailureOnlyDraft(nextFailureOnly);
        applyFilters(domainFilterDraft, nextFailureOnly);
    };
    const handleQueryClear = () => {
        if (searchInputRef.current) searchInputRef.current.value = '';
        setQuery('');
    };

    return (
        <LogOverlayContent
            isFocusScope={isFocusScope}
            titleKey={titleKey}
            titleMeta={titleMeta}
            filteredEvents={filteredEvents}
            normalizedQuery={normalizedQuery}
            filterPending={filterPending}
            searchInputRef={searchInputRef}
            domainFilterDraft={domainFilterDraft}
            failureOnlyDraft={failureOnlyDraft}
            onClose={onClose}
            onDomainFilterChange={handleDomainFilterChange}
            onFailureOnlyToggle={handleFailureOnlyToggle}
            onQueryApply={setQuery}
            onQueryClear={handleQueryClear}
        />
    );
}
