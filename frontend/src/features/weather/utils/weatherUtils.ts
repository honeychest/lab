// Purpose: 날씨 데이터 유틸리티 — 기온 기반 색상 계산 및 강수 형태 변환

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 파일의 역할 (날씨 유틸리티 모음)
 * ─────────────────────────────────────────────────────────────────
 *  날씨 기능 전반에서 공통으로 사용하는 타입 정의와 순수 함수들을 모아둔 파일.
 *
 *  포함 내용:
 *    1. WeatherData 인터페이스 — 서버 응답 데이터 구조 정의 (Java DTO와 매핑)
 *    2. getRelativeColor() — 기온 → 상대적 위치 → 색상 변환 (Cesium 3D 지도에 적용)
 *    3. getPtyText() — 기상청 강수형태 코드(0~4) → 한국어 텍스트 변환
 *
 *  사용처:
 *    - useWeatherData.ts: API 응답 파싱 시 WeatherData 타입 사용
 *    - useCesiumMap.js / cesiumUtils.js: polygon 색상 결정 시 getRelativeColor() 호출
 *    - WeatherPanel.jsx: 강수형태 표시 시 getPtyText() 호출
 *
 *  jQuery 비유:
 *    var Utils = {
 *      getRelativeColor: function(...) {...},
 *      getPtyText: function(...) {...}
 *    };
 *    처럼 공통 유틸 객체를 따로 분리해놓은 것과 유사한 패턴.
 *    단, TypeScript export/import 방식을 사용해 모듈화.
 * ─────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────
//  1. 타입 정의
// ─────────────────────────────────────────────────────────────────

/**
 * WeatherData: 서버에서 받아오는 날씨 데이터의 구조 정의.
 *
 * Java 백엔드의 WeatherHistory 엔티티 필드와 매핑:
 *   Java: String region / String city / int tmp / String hum / String wind / String rain
 *   TS:   name  / city / tmp(number) / hum(string) / wind(string) / rain(string)
 *
 * 왜 일부 필드가 string인가 (tmp만 number)?
 *   - tmp (기온): 수치 계산 (색상 보간, 최솟값/최댓값)에 바로 쓰이므로 number.
 *   - hum, wind, rain: 화면 출력 전용이므로 "%" 나 "m/s" 와 같이 단위가 붙은
 *     문자열 형태로 그대로 표시. 굳이 숫자로 변환할 필요가 없음.
 *   - pop: 기상청 데이터에서 값이 없으면 "-" 가 올 수 있어 string으로 처리.
 *
 * jQuery 비유:
 *   $.ajax success 콜백에서 받은 data 객체의 구조를 미리 선언해 두는 것.
 *   TypeScript는 컴파일 시 오타나 누락된 필드를 에러로 잡아줌.
 */
// 1. 서버에서 오는 날씨 데이터의 '설계도'를 만듭니다. (Java의 DTO와 매핑)
export interface WeatherData {
    /** 지역(시도)명. 예: "강원도", "서울특별시" */
    name: string;
    /** 상세 도시명 (선택). 예: "강원도 춘천시" → WeatherDetail 팝업 헤더에 표시 */
    city?: string;
    /** 기온 (°C, 정수). 색상 보간에 number 타입으로 직접 사용 */
    tmp: number;
    /** 강수확률 (%). 미제공 시 "-" 문자열. 예: "30", "-" */
    pop: string;
    /** 습도 (%). 예: "65" */
    hum: string;
    /** 풍속 (m/s). 예: "3.5" */
    wind: string;
    /** 강수량 (mm). 없으면 "0" 또는 "강수없음". 예: "5.0" */
    rain: string;
    /** 표시용 시각 문자열. CesiumPage.jsx에서 원본 time을 가공해 추가. 예: "22:00" */
    displayTime?: string;
    /** 원본 예보 시각 코드. 기상청 형식. 예: "2200" (22시), "0300" (03시) */
    time?: string;
}

// ─────────────────────────────────────────────────────────────────
//  2. 색상 보간 유틸리티
// ─────────────────────────────────────────────────────────────────

/**
 * RGB: 색상의 R(빨강)/G(초록)/B(파랑) 3원소를 담는 튜플 타입.
 *
 * [number, number, number] = 정확히 3개의 number 요소를 가진 배열.
 *   예: [255, 0, 0] = 빨강, [0, 0, 255] = 파랑
 *
 * type 별칭(alias)으로 선언해서 함수 시그니처를 읽기 쉽게 만듦.
 * jQuery에서 var color = {r:255, g:0, b:0}; 보다 간결하고 타입 안전.
 */
/** RGB 색상 보간 헬퍼 */
type RGB = [number, number, number];

/**
 * lerp: 두 RGB 색상 사이를 t(0~1) 비율로 선형 보간(Linear Interpolation).
 *
 * @param a - 시작 색상 (fraction = 0 일 때의 색상)
 * @param b - 끝 색상   (fraction = 1 일 때의 색상)
 * @param t - 보간 비율 (0 = a 색상 그대로, 1 = b 색상 그대로, 0.5 = 중간색)
 * @returns 보간된 RGB 색상 (각 채널 정수값)
 *
 * 알고리즘:
 *   result[i] = a[i] + (b[i] - a[i]) × t
 *   이를 채널(R, G, B) 3개에 각각 적용.
 *
 * 시각적 예시 (파랑 → 빨강, t=0.5):
 *   R: 0   + (255 - 0)   × 0.5 = 127.5 → 128 (Math.round)
 *   G: 0   + (0   - 0)   × 0.5 = 0
 *   B: 255 + (0   - 255) × 0.5 = 127.5 → 128
 *   결과: rgb(128, 0, 128) = 보라색 (파랑과 빨강의 중간)
 *
 * Math.round: 소수점 반올림으로 정수 RGB 값 생성.
 *   CSS rgb(r, g, b) 는 0~255 정수를 기대함.
 *
 * jQuery 비유:
 *   $.Color 플러그인의 색상 보간과 동일한 원리.
 *   jQuery UI 애니메이션에서도 내부적으로 같은 방식으로 색상을 전환함.
 */
const lerp = (a: RGB, b: RGB, t: number): RGB => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
];

// ─────────────────────────────────────────────────────────────────
//  3. 기온 → 색상 변환 함수
// ─────────────────────────────────────────────────────────────────

/**
 * getRelativeColor: 기온값을 전체 범위 대비 상대적 위치로 환산해 색상 반환.
 *
 * @param tmp    - 현재 지역의 기온 (°C)
 * @param minTmp - 이번 예보 시각 기준 전국 최저 기온
 * @param maxTmp - 이번 예보 시각 기준 전국 최고 기온
 * @returns CSS rgb() 색상 문자열. 예: "rgb(255, 165, 0)" (주황)
 *
 * 사용처:
 *   cesiumUtils.js에서 각 시도 polygon의 색상 결정 시 호출.
 *   전국 최저/최고 기온을 먼저 계산한 뒤, 각 지역 기온을 상대적으로 색칠.
 *
 * 상대적 색상의 의미:
 *   절대 온도(예: 30°C = 빨강)가 아니라 이 시각 기준 상대적으로 표현.
 *   여름 기준으로 전국 최고가 35°C, 최저가 25°C일 때:
 *     - 35°C 지역 → 빨강 (가장 더움)
 *     - 30°C 지역 → 주황 (중간)
 *     - 25°C 지역 → 파랑 (상대적으로 가장 서늘)
 *
 * 5단계 색상 스펙트럼:
 *
 *   fraction: 0.00  ──────────  0.25  ──────────  0.50  ──────────  0.75  ──────────  1.00
 *   색상:      파랑(BLUE)  →  하늘색(CYAN)  →  노랑(YELLOW)  →  주황(ORANGE)  →  빨강(RED)
 *   의미:      가장 추움                          중간                              가장 더움
 *
 * 정규화 (fraction 계산):
 *   fraction = (tmp - minTmp) / (maxTmp - minTmp)
 *   예: minTmp=10, maxTmp=30, tmp=20 → fraction = (20-10)/(30-10) = 0.5 → 노랑
 *
 * Math.max(0, Math.min(1, ...)):
 *   fraction이 0 미만이나 1 초과가 되지 않도록 클램핑(clamping).
 *   예: tmp가 minTmp보다 낮으면 fraction < 0 → 0으로 고정 → BLUE 표시.
 *
 * minTmp === maxTmp (모든 지역 기온이 같은 극단적 경우):
 *   나누기 0 방지. 흰색(white)을 반환해 화면에 이상하게 표시되지 않도록.
 *
 * jQuery 비유:
 *   var fraction = (tmp - minTmp) / (maxTmp - minTmp);
 *   var r = Math.round(lerp(0, 255, fraction));
 *   var color = 'rgb(' + r + ', 0, 0)'; // 단순 예시
 *   처럼 수동 계산하던 것을 함수화.
 */
export const getRelativeColor = (tmp: number, minTmp: number, maxTmp: number): string => {
    if (maxTmp === minTmp) return 'rgb(255, 255, 255)';

    // 0 ~ 1 사이로 정규화
    const fraction = Math.max(0, Math.min(1, (tmp - minTmp) / (maxTmp - minTmp)));

    // 5단계 색상 정의 (RGB 튜플)
    const BLUE:   RGB = [  0,   0, 255];  // 가장 서늘한 색
    const CYAN:   RGB = [  0, 255, 255];  // 하늘색
    const YELLOW: RGB = [255, 255,   0];  // 노랑 (중간)
    const ORANGE: RGB = [255, 165,   0];  // 주황
    const RED:    RGB = [255,   0,   0];  // 가장 더운 색

    let color: RGB;

    // fraction 위치에 따라 해당 구간의 두 색상 사이를 보간
    if (fraction <= 0.25) {
        // 0.00 ~ 0.25 구간: 파랑 → 하늘색
        color = lerp(BLUE, CYAN, fraction / 0.25);
    } else if (fraction <= 0.50) {
        // 0.25 ~ 0.50 구간: 하늘색 → 노랑
        color = lerp(CYAN, YELLOW, (fraction - 0.25) / 0.25);
    } else if (fraction <= 0.75) {
        // 0.50 ~ 0.75 구간: 노랑 → 주황
        color = lerp(YELLOW, ORANGE, (fraction - 0.50) / 0.25);
    } else {
        // 0.75 ~ 1.00 구간: 주황 → 빨강
        color = lerp(ORANGE, RED, (fraction - 0.75) / 0.25);
    }

    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
};

// ─────────────────────────────────────────────────────────────────
//  4. 강수형태 코드 변환 함수
// ─────────────────────────────────────────────────────────────────

/**
 * getPtyText: 기상청 강수형태(PTY) 코드를 한국어 텍스트로 변환.
 *
 * @param pty - 기상청 강수형태 코드 문자열. 예: "0", "1", "3"
 * @returns 한국어 텍스트. 예: "맑음", "비", "눈"
 *          알 수 없는 코드 입력 시 "정보 없음" 반환
 *
 * 기상청 PTY 코드 정의 (단기예보 기준):
 *   0: 강수없음 (맑음 또는 흐림)
 *   1: 비
 *   2: 비/눈 (진눈깨비)
 *   3: 눈
 *   4: 소나기 (짧고 강한 비)
 *
 * 입력이 반드시 string이어야 하는 이유:
 *   API 응답의 pty 값이 숫자(0)가 아닌 문자열("0")으로 옴.
 *   TypeScript 타입을 string으로 명시해 number와 혼동을 방지.
 *   ptyMap["0"] = "맑음" (O) / ptyMap[0] = undefined (X, 숫자 키와 불일치)
 *
 * ?? 연산자 (Nullish Coalescing):
 *   ptyMap[pty] 가 undefined (코드표에 없는 값)일 때 "정보 없음" 반환.
 *   jQuery 비유: ptyMap[pty] || "정보 없음" 과 거의 동일.
 *   차이: || 는 0, "" 같은 falsy 값도 대체하지만 ?? 는 null/undefined 만 대체.
 *
 * { [key: string]: string } 인덱스 시그니처:
 *   임의의 string 키로 접근 가능한 객체 타입.
 *   ptyMap["99"] 처럼 없는 키로 접근해도 undefined 반환 (에러 없음).
 *
 * jQuery 비유:
 *   var ptyMap = {"0":"맑음","1":"비",...};
 *   var text = ptyMap[pty] || "정보 없음";
 * 와 동일한 패턴.
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
