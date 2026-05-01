export default function InfoOverlay({ open, title, summary, bullets = [], stageLabel, onClose }) {
    if (!open) return null;

    return (
        <div
            className="logistics-overlay-backdrop"
            onClick={onClose}
        >
            <div
                className="logistics-side-section logistics-overlay-card"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="logistics-side-title">{title}</div>
                {stageLabel && <div className="logistics-meta-pill logistics-overlay-stage">{stageLabel}</div>}
                <p className="logistics-task-meta">{summary}</p>
                {bullets.length > 0 && (
                    <div className="logistics-overlay-list">
                        {bullets.map((bullet) => (
                            <div key={bullet} className="logistics-task-meta">• {bullet}</div>
                        ))}
                    </div>
                )}
                <div className="logistics-button-row">
                    <button className="logistics-outline-btn" onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    );
}
