// Purpose: 날씨 지도 메인 화면 — Cesium 지도와 날씨 패널/팝업 조합

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 컴포넌트의 역할
 * ─────────────────────────────────────────────────────────────────
 *  애플리케이션의 루트 컴포넌트.
 *  Cesium 3D 지구본 + 날씨 패널 + 지역 클릭 팝업을 조합.
 *
 *  컴포넌트 구조:
 *    Layout (헤더/푸터 레이아웃)
 *      └─ div.root
 *           ├─ CesiumMap (3D 지구본, 지역 클릭 이벤트 발생원)
 *           ├─ LoadingOverlay (초기 데이터 로딩 중 스피너)
 *           ├─ WeatherPanel (좌측/우측 패널, 시간 선택)
 *           └─ WeatherDetail (지역 클릭 시 팝업)
 *
 *  데이터 흐름:
 *    useWeatherData() → weatherList, availableHours, selectedHour
 *    CesiumMap.onRegionClick → handleRegionClick → selectedWeather
 *    selectedWeather → WeatherDetail 팝업 표시
 * ─────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react';
import { useWeatherData } from "../../hooks/useWeatherData";
import { GEO_ORDER } from "../../features/weather/constants/regions";
import Layout from "../../layout/Layout.jsx";
import WeatherDetail from '../../features/weather/components/WeatherDetail.tsx';
import CesiumMap from '../../features/weather/components/CesiumMap.jsx';
import WeatherPanel from '../../features/weather/components/WeatherPanel.jsx';
import ErrorPage from '../ErrorPage.tsx';
import styles from './CesiumPage.module.css';

function CesiumPage() {
    /**
     * selectedHourRef: 선택된 시간을 ref로 보관.
     *
     * 왜 useState가 아닌 useRef를 쓰나? (Stale Closure 문제 해결)
     *   CesiumMap에 전달된 onRegionClick 콜백은 처음 등록 당시의 selectedHour 값을
     *   클로저로 캡처함. 이후 selectedHour가 바뀌어도 콜백 내부에서는 옛날 값이 보임.
     *   이것이 "stale closure(오래된 클로저)" 문제.
     *
     *   useRef 해결책:
     *     ref.current는 항상 현재 값을 가리키는 "레퍼런스(참조)".
     *     콜백 내부에서 ref.current를 읽으면 항상 최신 값을 읽을 수 있음.
     *
     *   jQuery 비유:
     *     var selectedHour = 0; // 클로저로 캡처되면 stale
     *     // 대신: var hourRef = { current: 0 }; // 항상 최신값 참조 가능
     *     // 이벤트 핸들러 내부에서 hourRef.current를 읽으면 최신값 보장
     *
     *   초기값: 현재 시각의 시(hour) → 페이지 진입 시 해당 시간대 날씨 표시.
     */
    const selectedHourRef = useRef(new Date().getHours());

    /**
     * isMobile: 화면 너비 768px 미만이면 모바일로 판단.
     *   WeatherDetail(팝업), WeatherPanel(패널)의 스타일을 결정.
     *   모바일: 바텀 시트 팝업 / PC: 클릭 위치 기준 부유 팝업.
     */
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    /**
     * selectedWeather: 지역 클릭 시 표시할 날씨 데이터.
     *   null이면 WeatherDetail 팝업 숨김.
     *   handleRegionClick에서 지역 데이터를 찾아서 세팅.
     */
    const [selectedWeather, setSelectedWeather] = useState(null);

    /**
     * popupPos: WeatherDetail 팝업의 화면 좌표 (PC 전용).
     *   CesiumMap에서 지역 클릭 시 3D → 2D 화면좌표로 변환한 값을 받음.
     *   WeatherDetail의 pcStyle에서 left, top에 적용.
     */
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

    /**
     * useWeatherData: 날씨 데이터 훅.
     *   weatherList:     전국 10개 시도 날씨 데이터 배열 (GEO_ORDER 순서로 정렬됨)
     *   availableHours:  오늘 DB에 저장된 시간대 목록 (예: [0, 3, 6, 12])
     *   selectedHour:    현재 선택된 시간대
     *   setSelectedHour: 시간대 변경 함수 (WeatherPanel에서 호출)
     *   isInitialLoading: 첫 데이터 로딩 중 여부 (스피너 표시 여부 결정)
     *   minT / maxT:     전국 최저/최고 기온 (Cesium 색상 계산에 사용)
     */
    const {
        weatherList,
        availableHours,
        selectedHour,
        setSelectedHour,
        isInitialLoading,
        minT,
        maxT,
        errorCode,
        retry,
    } = useWeatherData();

    /**
     * selectedHour → selectedHourRef 동기화.
     *
     * useWeatherData의 selectedHour(state)가 바뀔 때마다
     * selectedHourRef.current도 최신값으로 업데이트.
     *
     * 왜 이 동기화가 필요한가?
     *   CesiumMap.onRegionClick 콜백 내부에서 selectedHourRef.current로
     *   현재 선택 시간을 읽기 때문. ref만 업데이트하면 리렌더링 없이 최신값 유지.
     *
     *   if (selectedHour !== null): null → null 동기화는 의미 없으므로 건너뜀.
     *   (초기 로딩 전에는 selectedHour가 null일 수 있음)
     */
    // selectedHour state가 바뀌면 ref도 동기화
    useEffect(() => {
        if (selectedHour !== null) selectedHourRef.current = selectedHour;
    }, [selectedHour]);

    /**
     * 반응형 처리: 화면 크기 변경 시 isMobile 업데이트.
     *
     * window.addEventListener('resize', ...):
     *   화면 너비가 768px 기준을 넘거나 미만으로 바뀔 때 isMobile 재계산.
     *   jQuery: $(window).on('resize', function() { ... }) 와 동일.
     *
     * return () => window.removeEventListener('resize', handleResize):
     *   컴포넌트 언마운트 시 이벤트 리스너 제거 (메모리 누수 방지).
     *   jQuery: $(window).off('resize', handleResize) 와 동일.
     *   의존성 배열 [] = 마운트 1회만 등록.
     */
    // 반응형 처리
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    /**
     * handleRegionClick: CesiumMap에서 지역 클릭 시 호출되는 콜백.
     *
     * @param payload CesiumMap이 전달하는 클릭 정보 객체.
     *   null: 지도 빈 공간 클릭 → 팝업 닫기.
     *   { fullName, mappingName, screenPosition }:
     *     fullName:       GeoJSON의 원본 지역명 (예: "강원특별자치도")
     *     mappingName:    cesiumUtils.js에서 매핑된 이름 (예: "강원도")
     *     screenPosition: 클릭 지점의 화면 2D 좌표 { x, y }
     *
     * 지역명 → 날씨 데이터 매핑 로직:
     *   1. mappingName이 있으면 우선 사용 (cesiumUtils.js에서 이미 변환된 정확한 이름)
     *   2. 없으면 GEO_ORDER에서 fullName에 포함되는 이름 검색 (부분 일치 fallback)
     *   예: fullName="강원특별자치도" → mappingName="강원도"
     *   예: fullName="경기도"         → GEO_ORDER.find(...)로 "경기도" 검색
     *
     * displayTime 처리:
     *   found.time이 있으면: "1400" → substring(0,2) → "14" + "시" → "14시"
     *   없으면: selectedHourRef.current (현재 선택 시간)으로 대체.
     *   이유: DB 데이터에 time이 없는 경우 대비.
     *
     * pop (강수확률): undefined면 "0"으로 기본값 처리.
     * hum (습도), wind (풍속), rain (강수량): undefined면 "-"로 기본값 처리.
     */
    const handleRegionClick = (payload) => {
        if (!payload) {
            setSelectedWeather(null);
            return;
        }

        const { fullName, mappingName, screenPosition } = payload;
        setPopupPos({ x: screenPosition.x, y: screenPosition.y });

        const regionName = mappingName || GEO_ORDER.find(name => fullName.includes(name));
        if (!regionName) {
            setSelectedWeather(null);
            return;
        }

        const found = weatherList.find(w => w.name === regionName);
        if (!found) {
            setSelectedWeather(null);
            return;
        }

        setSelectedWeather({
            ...found,
            city: fullName,
            displayTime: found.time
                ? `${found.time.substring(0, 2)}시`
                : `${selectedHourRef.current}시`,
            pop: found.pop || "0",
            hum: found.hum || "-",
            wind: found.wind || "-",
            rain: found.rain || "0",
        });
    };

    /**
     * footerCenter: Layout 푸터에 표시할 기술 태그 목록.
     *
     * selectedWeather가 있을 때 (팝업 열림):
     *   ['Cesium', 'TypeScript'] → WeatherDetail.tsx가 TypeScript이므로 표시
     * selectedWeather가 없을 때 (팝업 닫힘):
     *   ['Cesium'] → Cesium 지도만 표시 중
     *
     * 이 값이 Layout → Footer → footerCenter prop으로 전달됨.
     */
    // 팝업 오픈 여부에 따라 TypeScript 태그 추가
    const footerCenter = selectedWeather
        ? ['Cesium', 'TypeScript']
        : ['Cesium'];

    return (
        <Layout footerCenter={footerCenter}>
            {/* API 오류 시 URL 변경 없이 현재 페이지 위에 에러 오버레이 표시 */}
            {errorCode && <ErrorPage code={errorCode} onRetry={retry} />}
            <div className={styles.root}>
                {/* CesiumMap: 3D 지구본 지도. 지역 클릭 시 handleRegionClick 호출 */}
                <CesiumMap
                    weatherList={weatherList}
                    minT={minT}
                    maxT={maxT}
                    onRegionClick={handleRegionClick}
                />

                {/* 초기 로딩 스피너: isInitialLoading=true 동안만 표시 */}
                {isInitialLoading && (
                    <div className={styles.loadingOverlay}>
                        <div className={styles.spinner} />
                        <div className={styles.loadingText}>날씨 데이터 로딩 중...</div>
                    </div>
                )}

                {/*
                  WeatherPanel: 좌측/하단 날씨 목록 + 시간 선택 패널.
                  availableHours: 시간대 선택 버튼 목록
                  setSelectedHour: 시간 선택 시 날씨 데이터 재조회 트리거
                */}
                <WeatherPanel
                    weatherList={weatherList}
                    availableHours={availableHours}
                    selectedHour={selectedHour}
                    setSelectedHour={setSelectedHour}
                    isMobile={isMobile}
                    minT={minT}
                    maxT={maxT}
                />

                {/* 지역 클릭 시 날씨 상세 팝업: selectedWeather가 있을 때만 렌더링 */}
                {selectedWeather && (
                    <WeatherDetail
                        weather={selectedWeather}
                        isMobile={isMobile}
                        popupPos={popupPos}
                        onClose={() => setSelectedWeather(null)}
                    />
                )}
            </div>
        </Layout>
    );
}

export default CesiumPage;
