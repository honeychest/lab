import { useEffect, useState, useCallback } from 'react';
import { logisticsQueue } from '@/domain/logistics/common/queue';

const DOMAIN_META = {
    order:    { label: 'OMS',     color: '#5cbeff' },
    shipment: { label: 'WMS',     color: '#a78bfa' },
    dispatch: { label: 'TMS',     color: '#34d399' },
    quality:  { label: 'QMS',     color: '#fb923c' },
    eos:      { label: 'EOS',     color: '#f472b6' },
    inbound:  { label: 'INBOUND', color: '#facc15' },
};

const STATUS_COLOR = {
    done:       '#10b981',
    failed:     '#ef4444',
    processing: '#5cbeff',
    pending:    '#f59e0b',
    unhandled:  '#64748b',
};

function StatusPill({ count, status }) {
    if (count === 0) return null;
    return (
        <span
            className="qs-pill"
            style={{ color: STATUS_COLOR[status], borderColor: `${STATUS_COLOR[status]}55` }}
        >
            {status[0].toUpperCase()}{count}
        </span>
    );
}

function DomainRow({ domain, summary }) {
    const meta = DOMAIN_META[domain] ?? { label: domain.toUpperCase(), color: '#9aa3b2' };
    const active = summary.processing > 0 || summary.pending > 0 || summary.failed > 0;
    return (
        <div className={`qs-domain-row${active ? ' qs-domain-active' : ''}`}>
            <span className="qs-domain-label" style={{ color: meta.color }}>{meta.label}</span>
            <div className="qs-domain-pills">
                <StatusPill count={summary.processing} status="processing" />
                <StatusPill count={summary.pending} status="pending" />
                <StatusPill count={summary.failed} status="failed" />
                <StatusPill count={summary.done} status="done" />
                <StatusPill count={summary.unhandled} status="unhandled" />
            </div>
            <span className="qs-domain-total">{summary.total}</span>
        </div>
    );
}

export default function QueueSnapshotPanel() {
    const [open, setOpen] = useState(false);
    const [snapshot, setSnapshot] = useState(null);

    useEffect(() => {
        const unsub = logisticsQueue.subscribeSnapshot(setSnapshot);
        return unsub;
    }, []);

    const toggle = useCallback(() => setOpen(v => !v), []);

    const totals = snapshot?.totals;
    const hasActivity = totals && (totals.processing > 0 || totals.pending > 0 || totals.failed > 0);
    const domainEntries = snapshot
        ? Object.entries(snapshot.byDomain).sort((a, b) => {
            const order = Object.keys(DOMAIN_META);
            return order.indexOf(a[0]) - order.indexOf(b[0]);
        })
        : [];

    return (
        <div className="qs-root">
            <button
                type="button"
                className={`qs-toggle${open ? ' qs-toggle-open' : ''}${hasActivity && !open ? ' qs-toggle-pulse' : ''}`}
                onClick={toggle}
                title="Queue 상태 패널"
            >
                <span className="qs-toggle-label">Q</span>
                {hasActivity && !open && (
                    <span className="qs-badge">{totals.processing + totals.pending + totals.failed}</span>
                )}
            </button>

            {open && snapshot && (
                <div className="qs-panel">
                    <div className="qs-panel-header">
                        <span className="qs-panel-title">Queue 상태</span>
                        <span className="qs-panel-consumers">{snapshot.consumers.length}개 consumer</span>
                    </div>

                    <div className="qs-totals">
                        <StatusPill count={totals.processing} status="processing" />
                        <StatusPill count={totals.pending} status="pending" />
                        <StatusPill count={totals.failed} status="failed" />
                        <StatusPill count={totals.done} status="done" />
                        <span className="qs-total-msgs">{totals.total}건</span>
                    </div>

                    {domainEntries.length > 0 && (
                        <div className="qs-domains">
                            {domainEntries.map(([domain, summary]) => (
                                <DomainRow key={domain} domain={domain} summary={summary} />
                            ))}
                        </div>
                    )}

                    {domainEntries.length === 0 && (
                        <div className="qs-empty">메시지 없음</div>
                    )}
                </div>
            )}
        </div>
    );
}
