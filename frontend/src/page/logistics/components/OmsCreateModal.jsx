import {
    DESTINATION_OPTIONS,
    ITEM_OPTIONS,
    OWNER_OPTIONS,
} from '../services/omsSimulation';

export default function OmsCreateModal({
    mode,
    form,
    selectedOwner,
    onOwnerChange,
    onFormChange,
    onSubmit,
    onClose,
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
                zIndex: 110,
            }}
            onClick={onClose}
        >
            <div
                className="logistics-side-section"
                style={{ background: 'var(--dark-modal-bg)', minWidth: '340px', maxWidth: '420px' }}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="logistics-side-title">{mode === 'inbound' ? '입고 예약' : '오더 등록'}</div>
                <div className="logistics-settings-advanced" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                    <label className="logistics-slider-wrap compact">
                        <span className="logistics-settings-stage"><span>화주</span></span>
                        <select
                            value={selectedOwner}
                            onChange={(event) => onOwnerChange(event.target.value)}
                            className="logistics-outline-btn"
                        >
                            {OWNER_OPTIONS.map(owner => <option key={owner} value={owner}>{owner}</option>)}
                        </select>
                    </label>
                    <label className="logistics-slider-wrap compact">
                        <span className="logistics-settings-stage"><span>품목</span></span>
                        <select
                            value={form.itemCode}
                            onChange={(event) => onFormChange(current => ({ ...current, itemCode: event.target.value }))}
                            className="logistics-outline-btn"
                        >
                            {ITEM_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                        </select>
                    </label>
                    <label className="logistics-slider-wrap compact">
                        <span className="logistics-settings-stage"><span>도착지</span></span>
                        <select
                            value={form.destination}
                            onChange={(event) => onFormChange(current => ({ ...current, destination: event.target.value }))}
                            className="logistics-outline-btn"
                        >
                            {DESTINATION_OPTIONS.map(destination => <option key={destination} value={destination}>{destination}</option>)}
                        </select>
                    </label>
                    <label className="logistics-slider-wrap compact">
                        <span className="logistics-settings-stage">
                            <span>수량</span>
                            <span className="logistics-meta-pill">{form.quantity} ea</span>
                        </span>
                        <input
                            type="range"
                            min="1"
                            max="30"
                            step="1"
                            value={form.quantity}
                            onChange={(event) => onFormChange(current => ({ ...current, quantity: Number(event.target.value) }))}
                        />
                    </label>
                </div>
                <div className="logistics-button-row">
                    <button className="logistics-primary-btn" onClick={onSubmit}>
                        {mode === 'inbound' ? '입고 요청 생성' : '오더 생성'}
                    </button>
                    <button className="logistics-outline-btn" onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    );
}
