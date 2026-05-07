export default function OmsBulkProgress({ progress }) {
    if (!progress.active) return null;

    return (
        <div className="logistics-preview-ribbon" style={{ padding: '14px', borderRadius: '16px', marginBottom: '12px' }}>
            <div className="logistics-side-title">일괄 등록 진행</div>
            <div className="logistics-preview-note">순차 투입 중 {progress.current}/{progress.total}</div>
            <div className="logistics-progress" style={{ marginTop: '10px' }}>
                <span style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
        </div>
    );
}
