import { useEffect, useRef, useState } from 'react';
import { getRelativeColor } from "./features/weather/utils/weatherUtils.ts";
import { useWeatherData } from "./hooks/useWeatherData";
import { GEO_ORDER } from "./features/weather/constants/regions";
import Layout from "./layout/Layout.jsx";
import Draggable from 'react-draggable';
import WeatherDetail from './features/weather/components/WeatherDetail.tsx';
import CesiumMap from './features/weather/components/CesiumMap.jsx';
import styles from './App.module.css';

function App() {
    const nodeRef = useRef(null);

    // 클릭 핸들러 안에서 selectedHour 최신값을 참조하기 위한 ref
    const selectedHourRef = useRef(new Date().getHours());

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
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

    // 시간 선택 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = () => setIsTimePickerOpen(false);
        if (isTimePickerOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isTimePickerOpen]);

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

                {/* 드래그 가능한 날씨 패널 */}
                <Draggable
                    nodeRef={nodeRef}
                    bounds="parent"
                    handle=".drag-handle"
                    cancel=".no-drag"
                >
                    <div
                        ref={nodeRef}
                        className={styles.weatherPanel}
                        style={{ width: isMobile ? (isCollapsed ? 'auto' : '140px') : '180px' }}
                    >
                        <div style={{ marginBottom: isCollapsed ? '0' : '8px' }}>
                            <div className={`drag-handle ${styles.panelHeader}`}>
                                {isCollapsed ? (
                                    <span className={styles.panelTitleIcon}>🌡️</span>
                                ) : (
                                    <div className={styles.panelTitleRow}>
                                        <span className={styles.panelTitle}>전국 기온</span>
                                        <button
                                            className={`no-drag ${styles.timePickerBtn}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsTimePickerOpen(!isTimePickerOpen);
                                            }}
                                        >
                                            ({selectedHour !== null ? selectedHour.toString().padStart(2, '0') : '--'}:00)
                                            <span className={styles.timePickerArrow}>▼</span>
                                        </button>
                                    </div>
                                )}
                                <button
                                    className={`no-drag ${styles.collapseBtn}`}
                                    onClick={() => setIsCollapsed(!isCollapsed)}
                                >
                                    {isCollapsed ? '펼치기' : '접기'}
                                </button>
                            </div>

                            {/* 시간 선택 드롭다운 */}
                            {!isCollapsed && isTimePickerOpen && (
                                <div
                                    className={`no-drag ${styles.timePickerDropdown}`}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className={styles.timePickerGrid}>
                                        {availableHours.map(hour => (
                                            <button
                                                key={hour}
                                                className={`${styles.timePickerItem} ${
                                                    hour === selectedHour
                                                        ? styles.timePickerItemSelected
                                                        : styles.timePickerItemDefault
                                                }`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedHour(hour);
                                                    setIsTimePickerOpen(false);
                                                }}
                                            >
                                                {hour.toString().padStart(2, '0')}시
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 지역별 기온 리스트 */}
                        {!isCollapsed && (
                            <div className={styles.weatherList}>
                                {weatherList.map((item, i) => (
                                    <div key={i} className={styles.weatherListItem}>
                                        <span>{item.name}</span>
                                        <span
                                            className={styles.weatherListTemp}
                                            style={{ color: getRelativeColor(item.tmp, minT, maxT) }}
                                        >
                                            {item.tmp}°
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Draggable>

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