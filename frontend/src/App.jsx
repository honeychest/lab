import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getRelativeColor } from "./features/weather/utils/weatherUtils.ts";
import Draggable from 'react-draggable';
import WeatherDetail from './features/weather/components/WeatherDetail.tsx';
import styles from './App.module.css';

const GEO_ORDER = ["서울특별시", "경기도", "강원도", "충청북도", "충청남도", "전라북도", "경상북도", "전라남도", "경상남도", "제주특별자치도"];
const CITY_TO_PROVINCE = { "광주": "전라남도", "대구": "경상북도", "대전": "충청남도", "울산": "경상남도", "부산": "경상남도", "인천": "경기도", "세종": "충청남도" };

function App() {
    const cesiumContainer = useRef(null);
    const viewerRef = useRef(null);
    const nodeRef = useRef(null);
    const selectedEntityRef = useRef(null);

    // 클릭 핸들러 안에서 selectedHour 최신값을 참조하기 위한 ref
    const selectedHourRef = useRef(new Date().getHours());

    const [weatherList, setWeatherList] = useState([]);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [selectedHour, setSelectedHour] = useState(null); // null로 초기화 → available-hours 응답 후 세팅
    const [availableHours, setAvailableHours] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
    const [selectedWeather, setSelectedWeather] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

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

    // ✅ Cesium viewer 초기화 - 마운트 1회만 실행 (selectedHour 의존성 제거)
    useEffect(() => {
        if (!cesiumContainer.current) return;

        const viewer = new Cesium.Viewer(cesiumContainer.current, {
            terrainProvider: null, animation: false, timeline: false,
            baseLayerPicker: false, infoBox: false, selectionIndicator: false,
            fullscreenButton: true, requestRenderMode: true, maximumRenderTimeChange: Infinity,
            creditContainer: document.createElement("div")
        });
        viewerRef.current = viewer;
        viewer.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(127.5, 36.0, 1300000.0) });

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click) => {
            const pickedObject = viewer.scene.pick(click.position);

            if (selectedEntityRef.current) {
                const prev = selectedEntityRef.current;
                prev.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.5);
                prev.polygon.outlineWidth = 1;
                prev.polygon.extrudedHeight = 0;
            }

            if (Cesium.defined(pickedObject) && pickedObject.id) {
                const entity = pickedObject.id;
                let h = 0;
                entity.polygon.outlineColor = Cesium.Color.GRAY;
                entity.polygon.outlineWidth = 4;
                entity.polygon.extrudedHeight = new Cesium.CallbackProperty(() => {
                    if (h < 30000) h += 10000;
                    return h;
                }, false);

                selectedEntityRef.current = entity;
                setPopupPos({ x: click.position.x, y: click.position.y });

                const fullName = entity.properties.name?._value || "";
                let mappingName = null;
                for (const [city, province] of Object.entries(CITY_TO_PROVINCE)) {
                    if (fullName.includes(city)) { mappingName = province; break; }
                }
                if (!mappingName) mappingName = GEO_ORDER.find(name => fullName.includes(name));

                setWeatherList(prev => {
                    const found = prev.find(w => w.name === mappingName);
                    if (found) {
                        setSelectedWeather({
                            ...found,
                            city: fullName,
                            // ✅ state 대신 ref로 읽어서 stale closure 방지
                            displayTime: found.time
                                ? `${found.time.substring(0, 2)}시`
                                : `${selectedHourRef.current}시`,
                            pop: found.pop || "0", hum: found.hum || "-",
                            wind: found.wind || "-", rain: found.rain || "0"
                        });
                    }
                    return prev;
                });
            } else {
                setSelectedWeather(null);
                selectedEntityRef.current = null;
            }
            viewer.scene.requestRender();
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return () => { handler.destroy(); viewer.destroy(); };
    }, []); // ✅ 의존성 배열 비움 → 마운트 1회만 실행

    // ✅ available-hours 먼저 받아온 뒤 selectedHour 세팅
    useEffect(() => {
        const fetchAvailableHours = async () => {
            try {
                const res = await fetch('/api/weather/available-hours');
                const data = await res.json();
                if (data && data.length > 0) {
                    setAvailableHours(data);
                    setSelectedHour(data[data.length - 1]); // 가장 최근 시간으로 세팅
                }
            } catch {
                const fallback = Array.from({ length: new Date().getHours() + 1 }, (_, i) => i);
                setAvailableHours(fallback);
                setSelectedHour(fallback[fallback.length - 1]);
            }
        };
        fetchAvailableHours();
    }, []);

    // 지도 색상 업데이트
    const updateMapColors = (ds, sorted, minT, maxT) => {
        ds.entities.values.forEach(entity => {
            const name = entity.properties.name?._value || "";
            let target = null;
            for (const [c, p] of Object.entries(CITY_TO_PROVINCE)) if (name.includes(c)) target = p;
            if (!target) target = GEO_ORDER.find(n => name.includes(n));
            const regionData = sorted.find(d => d.name === target);
            if (regionData) {
                entity.polygon.material = Cesium.Color.fromCssColorString(
                    getRelativeColor(regionData.tmp, minT, maxT)
                );
                entity.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.5);
                entity.polygon.outlineWidth = 1;
            }
        });
        viewerRef.current.scene.requestRender();
    };

    // ✅ selectedHour가 세팅된 이후에만 날씨 데이터 fetch
    useEffect(() => {
        if (selectedHour === null) return;

        fetch(`/api/weather/all?hour=${selectedHour}`)
            .then(res => res.json())
            .then(data => {
                const sorted = GEO_ORDER.map(name => ({
                    name, ...data[name], tmp: parseFloat(data[name]?.tmp || 0)
                }));
                const temps = sorted.map(d => d.tmp);
                const minT = Math.min(...temps);
                const maxT = Math.max(...temps);
                setWeatherList(sorted);

                if (!viewerRef.current) return;

                if (viewerRef.current.dataSources.length === 0) {
                    // 최초 1회: GeoJSON 로드 후 색상 적용
                    Cesium.GeoJsonDataSource.load('/data/korea.json').then(ds => {
                        viewerRef.current.dataSources.add(ds);
                        updateMapColors(ds, sorted, minT, maxT);
                        setIsInitialLoading(false);
                    });
                } else {
                    // 이후 시간 변경 시: 색상만 업데이트
                    updateMapColors(viewerRef.current.dataSources.get(0), sorted, minT, maxT);
                }
            })
            .catch(() => setIsInitialLoading(false));
    }, [selectedHour]);

    // 시간 선택 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = () => setIsTimePickerOpen(false);
        if (isTimePickerOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isTimePickerOpen]);

    const allTemps = weatherList.map(w => w.tmp);
    const minT = allTemps.length > 0 ? Math.min(...allTemps) : 0;
    const maxT = allTemps.length > 0 ? Math.max(...allTemps) : 0;

    return (
        <div className={styles.root}>
            <div ref={cesiumContainer} className={styles.cesiumContainer} />

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
    );
}

export default App;