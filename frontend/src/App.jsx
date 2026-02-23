import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getRelativeColor } from "./features/weather/utils/weatherUtils.ts";
import Draggable from 'react-draggable';
import WeatherDetail from './features/weather/components/WeatherDetail.tsx';

const GEO_ORDER = ["서울특별시", "경기도", "강원도", "충청북도", "충청남도", "전라북도", "경상북도", "전라남도", "경상남도", "제주특별자치도"];
const CITY_TO_PROVINCE = { "광주": "전라남도", "대구": "경상북도", "대전": "충청남도", "울산": "경상남도", "부산": "경상남도", "인천": "경기도", "세종": "충청남도" };

function App() {
    const cesiumContainer = useRef(null);
    const viewerRef = useRef(null);
    const nodeRef = useRef(null);
    const selectedEntityRef = useRef(null);

    const [weatherList, setWeatherList] = useState([]);
    const [range, setRange] = useState({ min: 0, max: 0 });
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    const [selectedHour, setSelectedHour] = useState(new Date().getHours());
    const [availableHours, setAvailableHours] = useState([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

    const handleMapClick = (e) => {
        const position = { x: e.client.x, y: e.client.y };
        setPopupPos(position);
    };

    const [selectedWeather, setSelectedWeather] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
                            displayTime: found.time ? `${found.time.substring(0, 2)}시` : `${selectedHour}시`,
                            pop: found.pop || "0", hum: found.hum || "-", wind: found.wind || "-", rain: found.rain || "0"
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
    }, [selectedHour]);

    useEffect(() => {
        const fetchAvailableHours = async () => {
            try {
                const res = await fetch('/api/weather/available-hours');
                const data = await res.json();
                if (data && data.length > 0) {
                    setAvailableHours(data);
                    setSelectedHour(data[data.length - 1]);
                }
            } catch (err) {
                setAvailableHours(Array.from({ length: new Date().getHours() + 1 }, (_, i) => i));
            }
        };
        fetchAvailableHours();
    }, []);

    const fetchWeatherData = (hour) => {
        fetch(`/api/weather/all?hour=${hour}`)
            .then(res => res.json())
            .then(data => {
                const sorted = GEO_ORDER.map(name => ({
                    name, ...data[name], tmp: parseFloat(data[name]?.tmp || 0)
                }));
                const temps = sorted.map(d => d.tmp);
                setWeatherList(sorted);
                setRange({ min: Math.min(...temps), max: Math.max(...temps) });

                if (viewerRef.current && viewerRef.current.dataSources.length === 0) {
                    Cesium.GeoJsonDataSource.load('/data/korea.json').then(ds => {
                        viewerRef.current.dataSources.add(ds);
                        updateMapColors(ds, sorted, Math.min(...temps), Math.max(...temps));
                        setIsInitialLoading(false);
                    });
                } else if (viewerRef.current?.dataSources.length > 0) {
                    updateMapColors(viewerRef.current.dataSources.get(0), sorted, Math.min(...temps), Math.max(...temps));
                }
            })
            .catch(() => setIsInitialLoading(false));
    };

    const updateMapColors = (ds, sorted, minT, maxT) => {
        ds.entities.values.forEach(entity => {
            const name = entity.properties.name?._value || "";
            let target = null;
            for (const [c, p] of Object.entries(CITY_TO_PROVINCE)) if (name.includes(c)) target = p;
            if (!target) target = GEO_ORDER.find(n => name.includes(n));
            const regionData = sorted.find(d => d.name === target);
            if (regionData) {
                entity.polygon.material = Cesium.Color.fromCssColorString(getRelativeColor(regionData.tmp, minT, maxT));
                entity.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.5);
                entity.polygon.outlineWidth = 1;
            }
        });
        viewerRef.current.scene.requestRender();
    };

    useEffect(() => { if (selectedHour !== null) fetchWeatherData(selectedHour); }, [selectedHour]);

    // 🆕 시간 선택 팝업 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = () => {
            if (isTimePickerOpen) setIsTimePickerOpen(false);
        };
        if (isTimePickerOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isTimePickerOpen]);

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
            <div ref={cesiumContainer} style={{ width: '100%', height: '100%' }} />

            {/* 🆕 초기 로딩 스피너 */}
            {isInitialLoading && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 9999
                }}>
                    <div style={{
                        width: '50px', height: '50px',
                        border: '5px solid rgba(255, 255, 255, 0.3)',
                        borderTop: '5px solid #00d4ff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 15px'
                    }} />
                    <div style={{ color: 'white', fontSize: '16px', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                        날씨 데이터 로딩 중...
                    </div>
                </div>
            )}

            <Draggable nodeRef={nodeRef} bounds="parent" handle=".drag-handle" cancel=".no-drag">
                <div ref={nodeRef} style={{
                    position: 'absolute', top: '15px', left: '15px',
                    width: isMobile ? (isCollapsed ? 'auto' : '140px') : '180px',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white', padding: '10px',
                    borderRadius: '10px', zIndex: 1000
                }}>
                    <div style={{ marginBottom: isCollapsed ? '0' : '8px' }}>
                        <div className="drag-handle" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'move'
                        }}>
                            {isCollapsed ? (
                                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>🌡️</span>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold' }}>전국 기온</span>
                                    {/* 🆕 시간 선택 버튼 */}
                                    <button
                                        className="no-drag"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsTimePickerOpen(!isTimePickerOpen);
                                        }}
                                        style={{
                                            padding: '2px 6px',
                                            backgroundColor: '#333',
                                            color: '#00d4ff',
                                            border: '1px solid #555',
                                            borderRadius: '4px',
                                            fontSize: '10px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        ({selectedHour.toString().padStart(2, '0')}:00)
                                        <span style={{ fontSize: '8px' }}>▼</span>
                                    </button>
                                </div>
                            )}
                            <button
                                className="no-drag"
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                style={{
                                    background: '#555',
                                    border: 'none',
                                    color: '#fff',
                                    fontSize: '9px',
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }}
                            >
                                {isCollapsed ? '펼치기' : '접기'}
                            </button>
                        </div>

                        {/* 🆕 시간 선택 팝업 */}
                        {!isCollapsed && isTimePickerOpen && (
                            <div
                                className="no-drag"
                                style={{
                                    position: 'absolute',
                                    top: '45px',
                                    left: '10px',
                                    backgroundColor: 'rgba(20, 20, 20, 0.98)',
                                    border: '1px solid #00d4ff',
                                    borderRadius: '8px',
                                    padding: '8px',
                                    zIndex: 10000,
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    boxShadow: '0 4px 12px rgba(0, 212, 255, 0.3)'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(4, 1fr)',
                                    gap: '6px'
                                }}>
                                    {availableHours.map(hour => (
                                        <button
                                            key={hour}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedHour(hour);
                                                setIsTimePickerOpen(false);
                                            }}
                                            style={{
                                                padding: '8px 4px',
                                                backgroundColor: hour === selectedHour ? '#00d4ff' : '#333',
                                                color: hour === selectedHour ? '#000' : '#fff',
                                                border: 'none',
                                                borderRadius: '4px',
                                                fontSize: '11px',
                                                fontWeight: hour === selectedHour ? 'bold' : 'normal',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {hour.toString().padStart(2, '0')}시
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    {!isCollapsed && (
                        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                            {weatherList.map((item, i) => {
                                // 1. 현재 리스트에서 숫자만 추출
                                const allTemps = weatherList.map(w => w.tmp);
                                // 2. 즉석에서 최소/최대 계산 (0, 0 방지)
                                const minT = Math.min(...allTemps);
                                const maxT = Math.max(...allTemps);

                                return (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                                        <span>{item.name}</span>
                                        <span style={{
                                            fontWeight: 'bold',
                                            color: getRelativeColor(item.tmp, minT, maxT) // 계산된 값을 직접 전달!
                                                    }}>{item.tmp}°
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Draggable>

            {selectedWeather && (
                <WeatherDetail
                    weather={selectedWeather}
                    isMobile={isMobile}
                    popupPos={popupPos}
                    onClose={() => setSelectedWeather(null)}
                />
            )}

            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default App;