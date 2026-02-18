// 1. 서버에서 오는 날씨 데이터의 '설계도'를 만듭니다. (Java의 DTO와 매핑)
export interface WeatherData {
    name: string;      // 지역명 (예: 강원도)
    city?: string;     // 상세 도시명 (예: 강원도 춘천시)
    tmp: number;       // 기온
    pop: string;       // 강수확률
    hum: string;       // 습도
    wind: string;      // 풍속
    rain: string;      // 강수량
    displayTime?: string; // 우리가 App.jsx에서 만든 "22시" 형태의 시간
    time?: string;     // 원본 시간 (2200 등)
}

/**
 * [색상 계산 함수]
 * 매개변수에 :number 라고 타입을 붙여주는 순간,
 * 이제 이 함수에 문자열을 넣으면 자바처럼 에러를 뱉습니다.
 */
export const getRelativeColor = (tmp: number, minTmp: number, maxTmp: number): string => {
    const range = maxTmp - minTmp;
    if (range === 0) return 'rgb(255, 255, 255)';

    const ratio = (tmp - minTmp) / range;

    const r = Math.round(255 * ratio);
    const b = Math.round(255 * (1 - ratio));
    const g = Math.round(100 * (1 - Math.abs(ratio - 0.5) * 2));

    return `rgb(${r}, ${g}, ${b})`;
};

/**
 * [강수 형태 변환 함수]
 * pty가 반드시 string이어야 함을 명시합니다.
 */
export const getPtyText = (pty: string): string => {
    const ptyMap: { [key: string]: string } = {
        "0": "맑음",
        "1": "비",
        "2": "비/눈",
        "3": "눈",
        "4": "소나기"
    };
    return ptyMap[pty] || "정보 없음";
};