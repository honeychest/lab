// [AGENT] 날씨 상세 팝업 — 지역 클릭 시 기온/강수/습도/풍속 표시, Draggable PC/모바일 bottom sheet
// 연관: CesiumPage.jsx, useCesiumMap.js
// Purpose: 지역 클릭 시 표시되는 날씨 상세 팝업 — 기온/강수/습도/풍속 정보 표시

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 컴포넌트의 역할 (날씨 상세 팝업)
 * ─────────────────────────────────────────────────────────────────
 *  Cesium 3D 지도에서 지역(polygon)을 클릭하면 그 지역의 날씨 정보를
 *  담은 팝업 카드를 화면에 띄우는 컴포넌트.
 *
 *  렌더링 위치:
 *    - PC:     클릭한 좌표 기준 오른쪽 130px 위치에 고정
 *    - 모바일: 화면 하단에서 위로 슬라이드되는 시트(bottom sheet) 형태
 *
 *  표시 정보:
 *    기온(°C) / 강수확률(%) / 습도(%) / 풍속(m/s)
 *    PC 전용 추가 항목: 강수량(mm) / 예보 시각
 *
 *  호출 구조:
 *    useCesiumMap (클릭 감지) → CesiumPage.jsx (상태 관리) → WeatherDetail (팝업 렌더링)
 *
 *  jQuery 비유:
 *    $.ajax로 받아온 날씨 데이터를 기반으로
 *    $('<div class="popup">...</div>').appendTo('body') 로 DOM에 붙이는 것과 유사.
 *    단, React는 state 변화 시 자동으로 가상 DOM이 재계산되어 렌더링되므로
 *    직접 DOM을 조작하지 않음.
 * ─────────────────────────────────────────────────────────────────
 */
import React, {useRef} from 'react';
import Draggable from "react-draggable";

// ─────────────────────────────────────────────────────────────────
//  타입 정의
// ─────────────────────────────────────────────────────────────────

/**
 * WeatherData: 팝업에 표시할 날씨 데이터의 구조 정의.
 *
 * CesiumPage.jsx에서 API 응답을 가공해 이 형태로 만들어 전달.
 * Spring Boot WeatherService의 응답 필드(tmp, hum, wind, rain 등)와 매핑됨.
 *
 * jQuery 비유:
 *   $.ajax success 콜백에서 data.tmp, data.hum... 로 접근하던 것을
 *   TypeScript interface로 구조를 미리 선언해 오타/누락을 컴파일 타임에 방지.
 */
interface WeatherData {
    /** 지역명. 예: "서울특별시", "강원도" */
    city: string;
    /** 예보 시각 문자열. 예: "2025년 1월 1일 오후 3:00" */
    displayTime: string;
    /** 기온 (°C, 정수) */
    tmp: number;
    /** 강수확률 (%). 값이 없으면 "-" 문자열 */
    pop: string;
    /** 습도 (%) */
    hum: string;
    /** 풍속 (m/s) */
    wind: string;
    /** 강수량 (mm). 없으면 "0" 또는 "강수없음" */
    rain: string;
}

/**
 * WeatherDetailProps: 부모 컴포넌트(CesiumPage.jsx)에서 전달받는 props 구조.
 *
 * 각 prop의 역할:
 *   weather   → 표시할 날씨 데이터 객체
 *   onClose   → 닫기 버튼 클릭 시 실행할 콜백 (CesiumPage.jsx에서 팝업 상태를 null로 초기화)
 *   isMobile  → 화면 너비 기준 모바일 여부 (true면 하단 시트, false면 고정 위치 팝업)
 *   popupPos  → 클릭한 화면 좌표 { x, y } (PC 팝업 위치 계산에 사용)
 */
interface WeatherDetailProps {
    weather: WeatherData;
    onClose: () => void;
    isMobile: boolean;
    popupPos: { x: number; y: number }; // prop 이름을 popupPos로 통일
}

// ─────────────────────────────────────────────────────────────────
//  메인 컴포넌트
// ─────────────────────────────────────────────────────────────────

/**
 * WeatherDetail: 날씨 상세 팝업 컴포넌트.
 *
 * React.FC<WeatherDetailProps>:
 *   FC = FunctionComponent. props 타입을 제네릭으로 지정.
 *   ({ weather, onClose, isMobile, popupPos }) = 구조분해 할당으로 props 수신.
 *   jQuery에서 function showPopup(weather, onClose, isMobile, pos) {...} 와 유사하지만,
 *   React는 반환값이 DOM 문자열이 아닌 가상 DOM 객체(JSX).
 */
const WeatherDetail: React.FC<WeatherDetailProps> = ({ weather, onClose, isMobile, popupPos }) => {
    // Draggable 이용을 위한 nodeRef 설정 없으면 findDOMNode 에런발생
    const nodeRef = useRef(null);
    // ── 모바일 스타일 ────────────────────────────────────────────
    /**
     * mobileStyle: 모바일 환경에서 화면 하단 전체 너비로 표시되는 시트 스타일.
     *
     * position: 'fixed':
     *   스크롤과 무관하게 화면(viewport) 기준으로 고정.
     *   jQuery의 CSS position:fixed와 동일.
     *   Cesium 지도가 스크롤되어도 팝업은 항상 제자리에 있음.
     *
     * bottom: '0', left: '0', width: '100%':
     *   화면 맨 아래에 꽉 차게 배치. iOS/Android 바텀 시트 패턴.
     *
     * padding 하단에 env(safe-area-inset-bottom):
     *   iPhone 홈 인디케이터(홈 버튼 없는 기종의 제스처 영역) 영역만큼 패딩 추가.
     *   이 처리 없이는 내용이 홈 인디케이터 뒤에 가려질 수 있음.
     *
     * borderTopLeftRadius / borderTopRightRadius: '20px':
     *   상단 모서리만 둥글게 → 시트가 아래에서 올라오는 시각적 느낌.
     *
     * animation: 'slideUp 0.3s ease-out':
     *   아래에서 위로 슬라이드 애니메이션. 하단 <style> 태그에 @keyframes slideUp 정의됨.
     *
     * zIndex: 9999:
     *   Cesium 캔버스(z-index 낮음) 위에 팝업이 표시되도록 최상단 레이어 배치.
     */
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

    // ── PC 스타일 ────────────────────────────────────────────────
    /**
     * pcStyle: PC 환경에서 클릭 위치 기준 우측에 고정 표시되는 팝업 스타일.
     *
     * left: popupPos.x + 130px:
     *   클릭한 지점의 X 좌표에서 오른쪽으로 130px 이동.
     *   클릭한 polygon과 팝업이 겹치지 않도록 여백을 줌.
     *
     * top: popupPos.y, transform: 'translateY(-50%)':
     *   팝업의 세로 중앙이 클릭 위치 Y 좌표에 맞춰지도록 설정.
     *   popupPos.y는 클릭 지점의 top 값 → 팝업을 절반만큼 위로 올려 중앙 정렬.
     *   jQuery에서 .css('top', pos.y - height/2 + 'px') 와 동일한 효과를
     *   transform으로 더 간결하게 구현.
     *
     * width: '260px':
     *   내용이 넘치지 않도록 고정 너비 설정.
     *
     * backdropFilter: 'blur(8px)':
     *   팝업 뒤 배경을 흐리게 처리 (iOS 스타일 유리 효과).
     *   CSS backdrop-filter. jQuery로는 구현하기 어려운 최신 CSS 기능.
     *
     * pointerEvents: 'auto':
     *   팝업 영역에서 마우스/터치 이벤트를 정상 처리 (클릭, 스크롤 등).
     *   Cesium 지도 위에 올라있으므로 명시적으로 설정 필요.
     *
     * animation: 'fadeIn 0.2s ease-out':
     *   나타날 때 서서히 보이는 페이드인 효과. 하단 <style>에 @keyframes 정의됨.
     */
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

    /**
     * containerStyle: isMobile 여부에 따라 mobileStyle 또는 pcStyle 중 하나를 선택.
     *
     * jQuery 비유:
     *   var containerStyle = isMobile ? mobileStyle : pcStyle;
     *   $popup.css(containerStyle);
     * 와 동일한 조건부 스타일 선택 로직.
     */
    const containerStyle = isMobile ? mobileStyle : pcStyle;

    // ── JSX 렌더링 ───────────────────────────────────────────────
    return (
        /* 1. Draggable이 전체를 감싸야 제목과 내용이 같이 움직입니다. */
        <Draggable nodeRef={nodeRef} bounds="parent" disabled={isMobile}>
            <div
                ref={nodeRef} /* 2. 반드시 여기에 ref를 달아줘야 DOM 에러가 안 납니다. */
                style={containerStyle}
            >
                {/* 모바일 전용 핸들 */}
                {isMobile && (
                    <div style={{ width: '36px', height: '4px', backgroundColor: '#f0f0f0', borderRadius: '2px', margin: '0 auto 12px' }} />
                )}

                {/* ── 헤더: 지역명 + 예보시각 + 닫기 버튼 ─────────── */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '14px',
                    cursor: isMobile ? 'default' : 'move' // PC에선 헤더를 잡고 옮길 수 있게 표시
                }}>
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

                {/* ── 정보 박스 그리드 ───────────────────────────────── */}
                <div style={isMobile
                    ? { display: 'flex', gap: '6px', overflow: 'hidden' }
                    : {
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px'
                    }
                }>
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
        </Draggable>
    );
};

// ─────────────────────────────────────────────────────────────────
//  내부 서브 컴포넌트: InfoBox
// ─────────────────────────────────────────────────────────────────

/**
 * InfoBoxProps: InfoBox 컴포넌트가 받는 props 타입.
 */
interface InfoBoxProps {
    /** 모바일 여부. 글자 크기, 패딩 크기 조절에 사용 */
    isMobile: boolean;
    /** 항목을 나타내는 이모지. 예: "🌡️", "💧" */
    icon: string;
    /** 항목 라벨. 예: "기온", "강수" */
    label: string;
    /** 표시할 값 문자열. 예: "23°C", "30%" */
    value: string;
    /** 값 텍스트 색상. 기본값 '#111' (거의 검정). 기온에만 '#ff4757' (빨강) 적용 */
    color?: string;
}

/**
 * InfoBox: 아이콘 + 라벨 + 값을 묶은 작은 정보 카드 컴포넌트.
 *
 * WeatherDetail 내부에서만 사용하는 재사용 가능한 서브 컴포넌트.
 * 기온, 강수, 습도, 풍속 등 각 항목마다 같은 구조를 반복하므로
 * 컴포넌트로 추출해 코드 중복 제거.
 *
 * jQuery 비유:
 *   function renderInfoBox(isMobile, icon, label, value, color) {
 *     return '<div class="info-box">...' + label + '...' + value + '...</div>';
 *   }
 *   $('#container').append(renderInfoBox(true, '🌡️', '기온', '23°C', '#ff4757'));
 * 와 유사하나, React는 string이 아닌 가상 DOM 객체를 반환.
 *
 * 모바일/PC 사이즈 분기:
 *   isMobile이 true면 글자/패딩을 작게 → 좁은 화면에서 4개가 한 줄에 들어오도록.
 *   isMobile이 false면 조금 크게 → PC에서 여유 있는 레이아웃.
 */
const InfoBox: React.FC<InfoBoxProps> = ({ isMobile, icon, label, value, color = '#111' }) => (
    <div style={{
        flex: isMobile ? '1' : '1',       // 가로 공간을 균등하게 분배
        minWidth: 0,                        // flex item이 텍스트 길이로 인해 넘치지 않도록
        backgroundColor: '#f8f9fa',         // 연한 회색 카드 배경
        padding: isMobile ? '10px 2px' : '10px 5px',
        borderRadius: '8px',
        textAlign: 'center',
        border: '1px solid #f1f1f1'         // 미세한 테두리
    }}>
        {/* 상단: 아이콘 + 라벨 (흐린 회색, 작은 글자) */}
        <div style={{ fontSize: isMobile ? '9px' : '10px', color: '#999', marginBottom: '2px' }}>{icon} {label}</div>
        {/* 하단: 값 (color prop으로 지정된 색상, 굵게) */}
        <div style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: '800', color: color }}>{value}</div>
    </div>
);

export default WeatherDetail;
