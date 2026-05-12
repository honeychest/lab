// Pure policy: when should the topmost trade be highlighted as "new"?
// Locks original TradePage behavior — highlight only when the first trade id
// actually changes from a known prior value (no highlight on initial mount).

export const HIGHLIGHT_DURATION_MS = 500;

export const detectNewFirstId = (prevFirstId, currentFirstId) => {
    if (prevFirstId == null) return null;
    if (currentFirstId == null) return null;
    if (currentFirstId === prevFirstId) return null;
    return currentFirstId;
};
