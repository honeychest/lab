export function getLogDomain(event) {
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
