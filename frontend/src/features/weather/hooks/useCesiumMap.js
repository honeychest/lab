// Purpose: Cesium viewer 초기화 및 날씨 데이터 연동 커스텀 훅
import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { updateMapColors, handleCesiumClick } from "../utils/cesiumUtils.js";

export function useCesiumMap({ weatherList, minT, maxT, onRegionClick }) {
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
    const refs = { selectedEntityRef, selectedEntityNameRef, selectedEntityMaterialRef, weatherDataRef, clickCallbackRef };
    handler.setInputAction(
      (click) => handleCesiumClick(click, viewer, refs),
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );

    return () => {
      handler.destroy();
      viewer.destroy();
    };
  }, []);

  // weatherList 변경 시 색상 갱신 / GeoJSON 최초 로드
  useEffect(() => {
    if (!viewerRef.current) return;
    if (!weatherList || weatherList.length === 0) return;

    const dataSources = viewerRef.current.dataSources;

    if (dataSources.length === 0) {
      Cesium.GeoJsonDataSource.load("/data/korea.json").then((ds) => {
        viewerRef.current.dataSources.add(ds);
        updateMapColors(ds, weatherList, minT, maxT, viewerRef.current);
      });
    } else {
      updateMapColors(dataSources.get(0), weatherList, minT, maxT, viewerRef.current);
    }
  }, [weatherList, minT, maxT]);

  return cesiumContainer;
}
