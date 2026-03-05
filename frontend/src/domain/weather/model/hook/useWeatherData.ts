// [AGENT] 날씨 데이터 패칭 훅 — available-hours 조회, 시간별 전국 날씨, minT/maxT 계산, retry
// 연관: CesiumPage.jsx, regions.ts
// Purpose: 날씨 데이터 패칭 커스텀 훅 — 사용 가능 시간 조회 및 시간별 전국 날씨 관리

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 훅의 역할
 * ─────────────────────────────────────────────────────────────────
 *  날씨 페이지(/cesium)에서 필요한 모든 날씨 데이터 관련 상태와 API 호출 로직 담당.
 *
 *  처리하는 작업:
 *    1. 서버에서 사용 가능한 시간 목록 조회 (00시~현재시)
 *    2. 선택된 시간의 전국 10개 시도 날씨 데이터 조회
 *    3. 기온 최솟값/최댓값 계산 (지도 색상 범위 결정용)
 *
 *  API 호출 흐름:
 *    앱 시작 → GET /api/weather/available-hours → 가장 최근 시간으로 자동 선택
 *    → GET /api/weather/all?hour=N → weatherList 설정
 *    사용자 시간 선택 → GET /api/weather/all?hour=선택시간 → weatherList 갱신
 *
 *  jQuery 비유:
 *    $(document).ready(function() {
 *      $.ajax({ url: '/api/weather/available-hours', success: function(hours) {
 *        selectedHour = hours[hours.length-1];
 *        $.ajax({ url: '/api/weather/all?hour=' + selectedHour, success: function(data) {
 *          renderMap(data);
 *        }});
 *      }});
 *    });
 *    → 이 훅이 위 전체 로직을 깔끔하게 캡슐화.
 * ─────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from "react";
import { GEO_ORDER } from "../../../../entity/weather/model/regions";

// ─────────────────────────────────────────────────────────────────
//  타입 정의
// ─────────────────────────────────────────────────────────────────

/**
 * WeatherDataItem: 한 시도(예: 서울, 경기)의 날씨 데이터 구조.
 *
 * 서버 응답 JSON 예시:
 * {
 *   "서울": { "tmp": "5", "hum": "60", "wind": "2.0", "pop": "20", "rain": "0" },
 *   "경기": { ... },
 *   ...
 * }
 *
 * [key: string]: unknown:
 *   TypeScript 인덱스 시그니처 = "나머지 키는 어떤 문자열이든 가능, 값은 unknown"
 *   서버가 추가 필드를 보내도 타입 오류 없이 허용.
 *   jQuery에서 var item = data[region]; item.tmp; item.hum; 처럼 접근하는 것과 유사.
 */
export interface WeatherDataItem {
  /** 지역 이름. 예: "서울", "경기", "강원" */
  name: string;
  /** 기온 (°C). 서버에서 문자열로 오나 parseFloat으로 변환 후 저장. */
  tmp: number;
  /** 예보 시간 문자열 (선택적). 예: "2024020615" */
  time?: string;
  /** 강수확률 (%). 문자열로 오기도 함. 예: "20" */
  pop?: string;
  /** 습도 (%). 예: "60" */
  hum?: string;
  /** 풍속 (m/s). 예: "2.0" */
  wind?: string;
  /** 강수량 (mm). 예: "0" 또는 "1.0" */
  rain?: string;
  /** 그 외 서버가 추가로 보내는 임의 필드 허용 */
  [key: string]: unknown;
}

/**
 * UseWeatherDataResult: useWeatherData 훅의 반환값 타입.
 * 컴포넌트에서 const { weatherList, availableHours, ... } = useWeatherData(); 로 사용.
 */
interface UseWeatherDataResult {
  /** 현재 선택된 시간대의 전국 날씨 목록 (GEO_ORDER 순서로 정렬) */
  weatherList: WeatherDataItem[];
  /** 서버에 데이터가 있는 시간 목록. 예: [0, 3, 6, 9, 12, 15, 18, 21] */
  availableHours: number[];
  /** 현재 선택된 시간. null = 아직 초기화 전 */
  selectedHour: number | null;
  /** 시간 선택 변경 함수. WeatherPanel에서 시간 버튼 클릭 시 호출 */
  setSelectedHour: (hour: number) => void;
  /** 최초 날씨 데이터 로딩 중 여부. true = 스켈레톤/로딩 표시 */
  isInitialLoading: boolean;
  /** 현재 데이터셋의 최저 기온. 지도 색상 범위 계산용 */
  minT: number;
  /** 현재 데이터셋의 최고 기온. 지도 색상 범위 계산용 */
  maxT: number;
  /** API 오류 시 설정되는 HTTP 상태 코드 문자열. null = 정상 */
  errorCode: string | null;
  /** 에러 상태를 초기화하고 데이터를 처음부터 다시 요청 */
  retry: () => void;
}

// ─────────────────────────────────────────────────────────────────
//  훅 본체
// ─────────────────────────────────────────────────────────────────

export function useWeatherData(): UseWeatherDataResult {

  // ── State 선언 ──────────────────────────────────────────────

  /** 현재 선택된 시간의 전국 날씨 데이터 목록 */
  const [weatherList, setWeatherList] = useState<WeatherDataItem[]>([]);

  /** 서버에 저장된 사용 가능 시간 목록 (예: [0, 3, 6, 9, ...]) */
  const [availableHours, setAvailableHours] = useState<number[]>([]);

  /** 현재 선택된 시간. null이면 날씨 데이터 조회 안 함 */
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  /** 최초 데이터 로딩 중 여부 (Cesium 지도 위 로딩 인디케이터 표시용) */
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  /** API 오류 시 설정되는 HTTP 상태 코드. null = 정상 */
  const [errorCode, setErrorCode] = useState<string | null>(null);

  /** retry() 호출 시 increment → available-hours useEffect 재실행으로 전체 체인 재시도 */
  const [retryKey, setRetryKey] = useState(0);

  // ── available-hours 조회 useEffect ──────────────────────────
  /**
   * 앱 시작 시 1회 실행: 서버에서 사용 가능한 시간 목록 조회.
   *
   * GET /api/weather/available-hours 응답 예시:
   *   [0, 3, 6, 9, 12, 15, 18, 21]
   *   DB에 저장된 시간대 목록. 스케줄러가 3시간마다 데이터 저장.
   *
   * 성공 시:
   *   - availableHours 설정
   *   - selectedHour = 마지막 시간 (가장 최근 데이터)
   *     data[data.length - 1]: 배열의 마지막 원소
   *     jQuery: data[data.length-1] 와 동일.
   *
   * 실패 또는 빈 응답 시 fallback:
   *   서버가 꺼져있거나 데이터가 없을 때를 위한 대비.
   *   현재 시각 기준 0~현재시 목록을 생성.
   *   Array.from({ length: N }, (_, i) => i):
   *     0부터 N-1까지의 숫자 배열 생성.
   *     Array.from({length: 5}, (_, i) => i) = [0, 1, 2, 3, 4]
   *     jQuery 비유: $.makeArray() 또는 for 루프로 배열 생성하는 것과 유사.
   *
   * fetch() vs axios:
   *   fetch = 브라우저 내장 API (폴리필 없이 사용 가능)
   *   axios = 외부 라이브러리 (더 편리하나 번들 크기 증가)
   *   여기서는 간단한 GET이므로 fetch 사용.
   */
  useEffect(() => {
    const fetchAvailableHours = async () => {
      try {
        const res = await fetch("/api/weather/available-hours");

        if (!res.ok) {
          setErrorCode(String(res.status));
          return;
        }

        const data: number[] = await res.json(); // 응답 JSON → 숫자 배열로 파싱
        if (data && data.length > 0) {
          setAvailableHours(data);
          setSelectedHour(data[data.length - 1]); // 가장 최근 시간을 기본 선택
        }
      } catch {
        // 네트워크 자체 단절 등 fetch 자체 실패 시
        setErrorCode('503');
      }
    };

    fetchAvailableHours();
  }, [retryKey]); // retryKey 변경 시 재실행 (retry() 호출 시 재시도)

  // ── 날씨 데이터 조회 useEffect ───────────────────────────────
  /**
   * selectedHour가 변경될 때마다 해당 시간의 전국 날씨 데이터 조회.
   * 의존성 배열 [selectedHour]: selectedHour가 바뀔 때마다 실행.
   *
   * GET /api/weather/all?hour=N 응답 예시:
   *   {
   *     "서울": { "tmp": "5", "hum": "60", "wind": "2.0" },
   *     "경기": { "tmp": "3", "hum": "65", "wind": "1.5" },
   *     ...10개 지역
   *   }
   *
   * GEO_ORDER 순서로 정렬:
   *   서버 응답은 키 순서가 보장되지 않음.
   *   Cesium 지도 색상과 WeatherPanel 목록이 일관된 순서로 표시되도록
   *   GEO_ORDER 배열 순서대로 재정렬.
   *
   * GEO_ORDER.map(name => ({ name, ...data[name], tmp: parseFloat(data[name].tmp) })):
   *   1. GEO_ORDER 순서로 각 지역 이름 순회
   *   2. 서버 데이터에서 해당 지역 데이터 꺼내기 (data?.[name] = 없으면 undefined)
   *   3. ?? {} = undefined면 빈 객체 (데이터 없는 지역 방어)
   *   4. tmp를 parseFloat으로 문자열 "5" → 숫자 5로 변환
   *   jQuery: $.map(GEO_ORDER, function(name) { return mergeData(data[name]); }) 와 유사.
   *
   * ...data?.[name] ?? {}:
   *   스프레드 연산자 = 객체의 모든 필드를 펼쳐서 합침.
   *   { name: "서울", ...{ tmp: "5", hum: "60" } }
   *   → { name: "서울", tmp: "5", hum: "60" }
   *   jQuery: $.extend({}, { name: "서울" }, data["서울"]) 와 동일.
   */
  useEffect(() => {
    if (selectedHour === null) return; // 시간이 아직 설정되지 않으면 스킵

    setIsInitialLoading(true); // 데이터 조회 시작 → 로딩 표시

    /**
     * Nginx proxy_intercept_errors 대응을 위해 async/await 방식으로 변환.
     * content-type 체크 후 서버 다운 여부를 판별한다.
     */
    const fetchWeather = async () => {
      try {
        const res = await fetch(`/api/weather/all?hour=${selectedHour}`);

        if (!res.ok) {
          setErrorCode(String(res.status));
          setIsInitialLoading(false);
          return;
        }

        const data = await res.json();
        // GEO_ORDER 순서로 데이터 정렬 + tmp 숫자 변환
        const sorted: WeatherDataItem[] = GEO_ORDER.map((name) => ({
          name,
          ...(data?.[name] ?? {}),               // 해당 지역 날씨 데이터 병합
          tmp: parseFloat(data?.[name]?.tmp ?? 0), // tmp 문자열 → 숫자 변환
        }));

        setWeatherList(sorted);
        setIsInitialLoading(false); // 로딩 완료
      } catch {
        // 네트워크 자체 단절 등 fetch 자체 실패 시
        setErrorCode('503');
        setIsInitialLoading(false);
      }
    };

    fetchWeather();
  }, [selectedHour]); // selectedHour 변경 시마다 재실행

  // ── 기온 범위 계산 ───────────────────────────────────────────
  /**
   * minT, maxT: 현재 날씨 데이터의 최저/최고 기온.
   * Cesium 지도 색상과 WeatherPanel 기온 색상의 범위 결정에 사용.
   *
   * 예: 데이터가 [5, 3, 8, -1, 12, 7, 4, 9, 6, 2] 이면
   *   minT = -1, maxT = 12
   *   -1°C → 파랑, 12°C → 빨강 으로 색상 매핑.
   *
   * allTemps: weatherList에서 tmp만 뽑은 숫자 배열.
   * Math.min(...allTemps): 스프레드 연산자로 배열을 개별 인자로 분해 후 최솟값 계산.
   *   jQuery 비유: Math.min.apply(null, allTemps) 와 동일 (구형 JS 방식).
   *
   * allTemps.length > 0 체크:
   *   weatherList가 비어있으면 Math.min() = Infinity 가 되므로 방어.
   */
  const allTemps = weatherList.map((w) => w.tmp);
  const minT = allTemps.length > 0 ? Math.min(...allTemps) : 0;
  const maxT = allTemps.length > 0 ? Math.max(...allTemps) : 0;

  // ── 반환값 ──────────────────────────────────────────────────
  const retry = () => {
    setErrorCode(null);
    setWeatherList([]);
    setAvailableHours([]);
    setSelectedHour(null);
    setIsInitialLoading(true);
    setRetryKey((k) => k + 1);
  };

  return {
    weatherList,
    availableHours,
    selectedHour,
    // setSelectedHour를 직접 반환하지 않고 래퍼 함수로 반환:
    //   외부에서 타입 안전하게 호출하도록 number 타입을 명시.
    setSelectedHour: (hour: number) => setSelectedHour(hour),
    isInitialLoading,
    minT,
    maxT,
    errorCode,
    retry,
  };
}
