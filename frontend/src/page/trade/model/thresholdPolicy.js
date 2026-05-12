// Pure: maps GET /api/binance/trades/threshold response to UI state shape,
// and composes the final edit permission from server flag + client admin flag.

export const mapThresholdResponse = (data) => ({
    value: data?.value ?? null,
    canEdit: Boolean(data?.canEdit),
});

export const composeCanEdit = (canEdit, hasAdminAccess) =>
    Boolean(canEdit) && Boolean(hasAdminAccess);
