// Purpose: 지역 클릭 시 표시되는 날씨 상세 팝업 — 기온/강수/습도/풍속 정보 표시
import React from 'react';

// 날씨 데이터 타입 정의
interface WeatherData {
    city: string;
    displayTime: string;
    tmp: number;
    pop: string;
    hum: string;
    wind: string;
    rain: string;
}

// 컴포넌트 프롭스 타입 정의
interface WeatherDetailProps {
    weather: WeatherData;
    onClose: () => void;
    isMobile: boolean;
    popupPos: { x: number; y: number }; // prop 이름을 popupPos로 통일
}

const WeatherDetail: React.FC<WeatherDetailProps> = ({ weather, onClose, isMobile, popupPos }) => {

    // 모바일 스타일 (기존 유지)
    const mobileStyle: React.CSSProperties = {
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

    // PC 스타일 - 클릭 위치 기준 우측 130px
    const pcStyle: React.CSSProperties = {
        position: 'fixed',
        // 클릭한 지점에서 우측으로 130px 이동
        left: `${popupPos.x + 130}px`,
        // 클릭한 지점의 Y좌표 - 팝업 세로 중앙 정렬
        top: `${popupPos.y}px`,
        transform: 'translateY(-50%)',
        width: '260px',
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease-out',
        border: '1px solid rgba(0,0,0,0.05)',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'auto'
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

            <div style={isMobile ? { display: 'flex', gap: '6px', overflow: 'hidden' } : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
            `}</style>
        </div>
    );
};

// 하단 정보 박스 컴포넌트
interface InfoBoxProps {
    isMobile: boolean;
    icon: string;
    label: string;
    value: string;
    color?: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ isMobile, icon, label, value, color = '#111' }) => (
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