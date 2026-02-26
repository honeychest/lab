// Purpose: 날씨 지도 메인 화면 — Cesium 지도와 날씨 패널/팝업 조합
import { useEffect, useRef, useState } from 'react';
import { useWeatherData } from "./hooks/useWeatherData";
import { GEO_ORDER } from "./features/weather/constants/regions";
import Layout from "./layout/Layout.jsx";
import WeatherDetail from './features/weather/components/WeatherDetail.tsx';
import CesiumMap from './features/weather/components/CesiumMap.jsx';
import WeatherPanel from './features/weather/components/WeatherPanel.jsx';
import styles from './App.module.css';

function App() {
    const selectedHourRef = useRef(new Date().getHours());

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [selectedWeather, setSelectedWeather] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

    const {
        weatherList,
        availableHours,
        selectedHour,
        setSelectedHour,
        isInitialLoading,
        minT,
        maxT,
    } = useWeatherData();

    // selectedHour state가 바뀌면 ref도 동기화
    useEffect(() => {
        if (selectedHour !== null) selectedHourRef.current = selectedHour;
    }, [selectedHour]);

    // 반응형 처리
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    // 팝업 오픈 여부에 따라 TypeScript 태그 추가
    const footerCenter = selectedWeather
        ? ['Cesium', 'TypeScript']
        : ['Cesium'];

    return (
        <Layout footerCenter={footerCenter}>
            <div className={styles.root}>
                <CesiumMap
                    weatherList={weatherList}
                    minT={minT}
                    maxT={maxT}
                    onRegionClick={handleRegionClick}
                />

                {/* 초기 로딩 스피너 */}
                {isInitialLoading && (
                    <div className={styles.loadingOverlay}>
                        <div className={styles.spinner} />
                        <div className={styles.loadingText}>날씨 데이터 로딩 중...</div>
                    </div>
                )}

                <WeatherPanel
                    weatherList={weatherList}
                    availableHours={availableHours}
                    selectedHour={selectedHour}
                    setSelectedHour={setSelectedHour}
                    isMobile={isMobile}
                    minT={minT}
                    maxT={maxT}
                />

                {/* 지역 클릭 시 날씨 상세 팝업 */}
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

export default App;
