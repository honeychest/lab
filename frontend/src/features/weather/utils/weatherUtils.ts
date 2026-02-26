// Purpose: 날씨 데이터 유틸리티 — 기온 기반 색상 계산 및 강수 형태 변환
// 1. 서버에서 오는 날씨 데이터의 '설계도'를 만듭니다. (Java의 DTO와 매핑)
export interface WeatherData {
    name: string;       // 지역명 (예: 강원도)
    city?: string;      // 상세 도시명 (예: 강원도 춘천시)
    tmp: number;        // 기온
    pop: string;        // 강수확률
    hum: string;        // 습도
    wind: string;       // 풍속
    rain: string;       // 강수량
    displayTime?: string; // 우리가 App.jsx에서 만든 "22시" 형태의 시간
    time?: string;      // 원본 시간 (2200 등)
}

/** RGB 색상 보간 헬퍼 */
type RGB = [number, number, number];

const lerp = (a: RGB, b: RGB, t: number): RGB => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
];

/**
 * [색상 계산 함수]
 * 기온의 상대적 위치에 따라 5단계 스펙트럼 색상을 반환합니다.
 *
 * fraction 0.00 ~ 0.25 : 파랑   → 하늘색  (가장 추움)
 * fraction 0.25 ~ 0.50 : 하늘색 → 노랑
 * fraction 0.50 ~ 0.75 : 노랑   → 주황
 * fraction 0.75 ~ 1.00 : 주황   → 빨강    (가장 더움)
 */
export const getRelativeColor = (tmp: number, minTmp: number, maxTmp: number): string => {
    if (maxTmp === minTmp) return 'rgb(255, 255, 255)';

    // 0 ~ 1 사이로 정규화
    const fraction = Math.max(0, Math.min(1, (tmp - minTmp) / (maxTmp - minTmp)));

    const BLUE:   RGB = [  0,   0, 255];
    const CYAN:   RGB = [  0, 255, 255];
    const YELLOW: RGB = [255, 255,   0];
    const ORANGE: RGB = [255, 165,   0];
    const RED:    RGB = [255,   0,   0];

    let color: RGB;

    if (fraction <= 0.25) {
        color = lerp(BLUE, CYAN, fraction / 0.25);
    } else if (fraction <= 0.50) {
        color = lerp(CYAN, YELLOW, (fraction - 0.25) / 0.25);
    } else if (fraction <= 0.75) {
        color = lerp(YELLOW, ORANGE, (fraction - 0.50) / 0.25);
    } else {
        color = lerp(ORANGE, RED, (fraction - 0.75) / 0.25);
    }

    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
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
    return ptyMap[pty] ?? "정보 없음";
};