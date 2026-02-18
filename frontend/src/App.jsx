import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getRelativeColor } from "./utils/weatherUtils";
import Draggable from 'react-draggable';
import WeatherDetail from './components/WeatherDetail';

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
        const position = { x: e.client.x, y: e.client.y }; // Cesium의 경우 cartesian을 윈도우 좌표로 변환한 값
        setPopupPos(position);
    };

    // 팝업 위치 관리를 위한 상태 추가
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

                // 클릭 좌표 저장 (PC용)
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
                entity.polygon.material = getRelativeColor(regionData.tmp, minT, maxT);
                entity.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.5);
                entity.polygon.outlineWidth = 1;
            }
        });
        viewerRef.current.scene.requestRender();
    };

    useEffect(() => { if (selectedHour !== null) fetchWeatherData(selectedHour); }, [selectedHour]);

    return (
        <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
            <div ref={cesiumContainer} style={{ width: '100%', height: '100%' }} />

            <Draggable nodeRef={nodeRef} bounds="parent" handle=".drag-handle" cancel=".no-drag">
                <div ref={nodeRef} style={{
                    position: 'absolute', top: '15px', left: '15px',
                    width: isMobile ? (isCollapsed ? 'auto' : '140px') : '180px', // 모바일만 auto 적용
                    backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white', padding: '10px',
                    borderRadius: '10px', zIndex: 1000
                }}>
                    <div className="drag-handle" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'move', marginBottom: isCollapsed ? '0' : '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{isCollapsed ? '🌡️' : '전국 기온'}</span>
                        <button className="no-drag" onClick={() => setIsCollapsed(!isCollapsed)} style={{ background: '#555', border: 'none', color: '#fff', fontSize: '9px', padding: '1px 4px', borderRadius: '3px' }}>
                            {isCollapsed ? '펼치기' : '접기'}
                        </button>
                    </div>
                    {!isCollapsed && (
                        <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                            {weatherList.map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                                    <span>{item.name}</span>
                                    <span style={{ fontWeight: 'bold', color: getRelativeColor(item.tmp, range.min, range.max).toCssColorString() }}>{item.tmp}°</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Draggable>

            {selectedWeather && (
                <WeatherDetail
                    weather={selectedWeather}
                    isMobile={isMobile}
                    popupPos={popupPos} // 좌표 전달
                    onClose={() => setSelectedWeather(null)}
                />
            )}
        </div>
    );
}

export default App;