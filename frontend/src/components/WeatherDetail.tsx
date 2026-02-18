import React from 'react';

const WeatherDetail = ({ weather, onClose, isMobile, position }) => {
    // position = { x: 500, y: 300 } 형태로 전달받는다고 가정

    const mobileStyle = {
        position: 'fixed',
        bottom: '0',
        left: '0',
        width: '100%',
        backgroundColor: '#ffffff',
        borderTopLeftRadius: '20px',
        borderTopRightRadius: '20px',
        padding: '12px 12px calc(15px + env(safe-area-inset-bottom)) 12px',
        boxShadow: '0 -4px 25px rgba(0,0,0,0.1)',
        zIndex: 9999,
        animation: 'slideUp 0.3s ease-out',
        boxSizing: 'border-box'
    };

    const pcStyle = {
        position: 'fixed',
        // 클릭한 지점(position.x)에서 우측으로 130px 이동
        left: `${position?.x + 130}px`,
        // 클릭한 지점(position.y) 중앙에 맞춤
        top: `${position?.y}px`,
        transform: 'translateY(-50%)',
        width: '260px', // 여백 축소를 위해 너비 더 줄임
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderRadius: '12px',
        padding: '16px', // 흰색 여백 축소
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease-out',
        border: '1px solid rgba(0,0,0,0.05)',
        backdropFilter: 'blur(8px)'
    };

    const containerStyle = isMobile ? mobileStyle : pcStyle;

    return (
        <div style={containerStyle}>
            {isMobile && (
                <div style={{ width: '36px', height: '4px', backgroundColor: '#f0f0f0', borderRadius: '2px', margin: '0 auto 12px' }} />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: isMobile ? '16px' : '17px', fontWeight: '800', color: '#111' }}>
                        {weather.city}
                    </h3>
                    <span style={{ fontSize: '11px', color: '#888' }}>{weather.displayTime}</span>
                </div>
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                    style={{
                        background: '#f5f5f5', border: 'none', borderRadius: '50%',
                        width: '28px', height: '28px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#999', fontSize: '12px', padding: 0
                    }}
                >✕</button>
            </div>

            <div style={isMobile ? {
                display: 'flex', gap: '6px', overflow: 'hidden'
            } : {
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'
            }}>
                <InfoBox isMobile={isMobile} icon="🌡️" label="기온" value={`${weather.tmp}°C`} color="#ff4757" />
                <InfoBox isMobile={isMobile} icon="💧" label="강수" value={weather.pop === "-" ? "0%" : `${weather.pop}%`} />
                <InfoBox isMobile={isMobile} icon="💦" label="습도" value={`${weather.hum}%`} />
                <InfoBox isMobile={isMobile} icon="💨" label="풍속" value={`${weather.wind}m/s`} />

                {!isMobile && (
                    <>
                        <InfoBox isMobile={isMobile} icon="☔" label="강수량" value={weather.rain === "0" || weather.rain === "강수없음" ? "0mm" : `${weather.rain}mm`} />
                        <InfoBox isMobile={isMobile} icon="🕒" label="시각" value={weather.displayTime} />
                    </>
                )}
            </div>

            <style>{`
                .cesium-widget-credits { display: none !important; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
};

const InfoBox = ({ isMobile, icon, label, value, color = '#111' }) => (
    <div style={{
        flex: isMobile ? '1' : '1',
        minWidth: 0,
        backgroundColor: '#f8f9fa',
        padding: isMobile ? '10px 2px' : '10px 5px',
        borderRadius: '8px',
        textAlign: 'center',
        border: '1px solid #f1f1f1'
    }}>
        <div style={{ fontSize: isMobile ? '9px' : '10px', color: '#999', marginBottom: '2px' }}>{icon} {label}</div>
        <div style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: '800', color: color }}>{value}</div>
    </div>
);

export default WeatherDetail;