import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getRelativeColor } from "../utils/weatherUtils.ts";
import { GEO_ORDER, CITY_TO_PROVINCE } from "../constants/regions";
import styles from "../../../App.module.css";

// 경계선 색상 상수 — 기온 색(파랑·하늘·노랑·주황·빨강) 전체 구간에서 눈에 띄도록 어두운 색 사용
// WHITE.withAlpha(0.5) 은 노랑 구간과 섞여 거의 안 보임
const OUTLINE_COLOR = Cesium.Color.fromCssColorString("#222222").withAlpha(0.88);
const OUTLINE_WIDTH = 2;
// ⚠️ 0으로 설정하면 Cesium이 ExtrudedPolygon → Polygon 타입 전환을 하면서
// GPU 버퍼를 완전히 새로 생성 → 투명 프레임 발생.
// 1m로 유지하면 항상 ExtrudedPolygon 타입이므로 타입 전환 없이 높이값만 변경됨.
const BASE_HEIGHT = 1;

function CesiumMap({ weatherList, minT, maxT, onRegionClick }) {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const selectedEntityRef = useRef(null);
  const selectedEntityNameRef = useRef(null); // 선택된 지역의 매핑 이름 (deselect 시 색상 재계산에 사용)
  // ⚠️ 이 ref는 절대 제거하지 말 것.
  // extrudedHeight를 CallbackProperty → 0으로 바꾸면 Cesium이 geometry를 재빌드하고,
  // 재빌드 과정에서 polygon.material(기온 색상)이 초기화되어 투명해진다.
  // 카메라가 기울어진 상태에서는 3D 프리즘 재빌드 시 property 참조가 stale해지므로
  // weatherDataRef에서 색상을 직접 재계산하는 방식을 우선 사용하고, 없으면 fallback.
  const selectedEntityMaterialRef = useRef(null); // fallback용
  const weatherDataRef = useRef({ weatherList: [], minT: 0, maxT: 0 });
  const clickCallbackRef = useRef(onRegionClick);

  // 클릭 핸들러(useEffect 내부 클로저)에서 최신 날씨 데이터를 참조하기 위한 ref 동기화
  useEffect(() => {
    weatherDataRef.current = { weatherList, minT, maxT };
  }, [weatherList, minT, maxT]);

  // onRegionClick 최신 값 유지
  useEffect(() => {
    clickCallbackRef.current = onRegionClick;
  }, [onRegionClick]);

  // Cesium viewer 초기화 (마운트 1회)
  useEffect(() => {
    if (!cesiumContainer.current) return;

    const viewer = new Cesium.Viewer(cesiumContainer.current, {
      terrainProvider: null,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      infoBox: false,
      selectionIndicator: false,
      fullscreenButton: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      creditContainer: document.createElement("div"),
    });

    viewerRef.current = viewer;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(127.5, 36.0, 1300000.0),
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    handler.setInputAction((click) => {
      const pickedObject = viewer.scene.pick(click.position);

      // 이전 선택 영역 스타일 복원
      if (selectedEntityRef.current) {
        const prev = selectedEntityRef.current;
        prev.polygon.outlineColor = OUTLINE_COLOR;
        prev.polygon.outlineWidth = OUTLINE_WIDTH;
        prev.polygon.extrudedHeight = BASE_HEIGHT; // 0 대신 1 → ExtrudedPolygon 타입 유지

        // 기온 색상 복원 (weatherDataRef로 재계산, fallback은 저장된 material)
        const { weatherList: wl, minT: mn, maxT: mx } = weatherDataRef.current;
        const regionData = wl.find((d) => d.name === selectedEntityNameRef.current);
        if (regionData) {
          prev.polygon.material = Cesium.Color.fromCssColorString(
              getRelativeColor(regionData.tmp, mn, mx)
          );
        } else if (selectedEntityMaterialRef.current) {
          prev.polygon.material = selectedEntityMaterialRef.current;
        }
      }

      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;

        // 새 엔티티 선택 전, 현재 기온 색상을 저장해둔다 (fallback용)
        selectedEntityMaterialRef.current = entity.polygon.material;

        let h = 0;
        entity.polygon.outlineColor = Cesium.Color.GRAY;
        entity.polygon.outlineWidth = 4;
        entity.polygon.extrudedHeight = new Cesium.CallbackProperty(() => {
          if (h < 30000) h += 10000;
          return h;
        }, false);

        selectedEntityRef.current = entity;

        const fullName = entity.properties.name?._value || "";

        let mappingName = null;
        for (const [city, province] of Object.entries(CITY_TO_PROVINCE)) {
          if (fullName.includes(city)) {
            mappingName = province;
            break;
          }
        }
        if (!mappingName) {
          mappingName = GEO_ORDER.find((name) => fullName.includes(name)) || null;
        }

        selectedEntityNameRef.current = mappingName; // deselect 시 색상 재계산용

        if (clickCallbackRef.current) {
          clickCallbackRef.current({
            fullName,
            mappingName,
            screenPosition: { x: click.position.x, y: click.position.y },
          });
        }
      } else {
        selectedEntityRef.current = null;
        selectedEntityNameRef.current = null;
        selectedEntityMaterialRef.current = null;
        if (clickCallbackRef.current) {
          clickCallbackRef.current(null);
        }
      }

      viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
    };
  }, []);

  // 지도 색상 업데이트
  const updateMapColors = (ds, sorted, localMinT, localMaxT) => {
    ds.entities.values.forEach((entity) => {
      const name = entity.properties.name?._value || "";

      let target = null;
      for (const [c, p] of Object.entries(CITY_TO_PROVINCE)) {
        if (name.includes(c)) {
          target = p;
          break;
        }
      }
      if (!target) {
        target = GEO_ORDER.find((n) => name.includes(n));
      }

      const regionData = sorted.find((d) => d.name === target);
      if (regionData) {
        entity.polygon.material = Cesium.Color.fromCssColorString(
            getRelativeColor(regionData.tmp, localMinT, localMaxT)
        );
        entity.polygon.outlineColor = OUTLINE_COLOR;
        entity.polygon.outlineWidth = OUTLINE_WIDTH;
        entity.polygon.extrudedHeight = BASE_HEIGHT; // 항상 ExtrudedPolygon 타입 유지
      }
    });

    viewerRef.current.scene.requestRender();
  };

  // weatherList 변경 시 색상 갱신 / GeoJSON 최초 로드
  useEffect(() => {
    if (!viewerRef.current) return;
    if (!weatherList || weatherList.length === 0) return;

    const dataSources = viewerRef.current.dataSources;

    if (dataSources.length === 0) {
      Cesium.GeoJsonDataSource.load("/data/korea.json").then((ds) => {
        viewerRef.current.dataSources.add(ds);
        updateMapColors(ds, weatherList, minT, maxT);
      });
    } else {
      updateMapColors(dataSources.get(0), weatherList, minT, maxT);
    }
  }, [weatherList, minT, maxT]);

  return <div ref={cesiumContainer} className={styles.cesiumContainer} />;
}

export default CesiumMap;