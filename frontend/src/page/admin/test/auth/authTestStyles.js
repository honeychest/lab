export const pageRootStyle = {
    minHeight: 'calc(100vh - 220px)',
    display: 'grid',
    gap: '16px',
    color: 'var(--monitor-text-primary)',
};

export const pageTitleStyle = {
    fontSize: '24px',
    fontWeight: 700,
};

export const pageDescriptionStyle = {
    color: 'var(--monitor-text-secondary)',
    fontSize: '14px',
};

export function getGridStyle(isNarrow) {
    return {
        display: 'grid',
        gridTemplateColumns: isNarrow
            ? '1fr'
            : 'minmax(260px, 0.9fr) minmax(300px, 1.2fr) minmax(240px, 0.9fr)',
        gap: '14px',
        minHeight: 0,
    };
}

export const columnCardStyle = {
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-card-bg)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    display: 'grid',
    gap: '12px',
    padding: '16px',
    minHeight: 0,
    overflowY: 'auto',
};

export const sectionTitleStyle = {
    fontWeight: 700,
    fontSize: '16px',
};

export const sectionDescriptionStyle = {
    fontSize: '13px',
    color: 'var(--monitor-text-secondary)',
};

export const buttonStyle = {
    padding: '12px 16px',
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-primary)',
    color: '#ffffff',
    cursor: 'pointer',
};

export const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-sidebar-bg)',
    color: 'var(--monitor-text-primary)',
    outline: 'none',
};

export const subCardStyle = {
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-sidebar-bg)',
    padding: '12px',
    display: 'grid',
    gap: '8px',
};
