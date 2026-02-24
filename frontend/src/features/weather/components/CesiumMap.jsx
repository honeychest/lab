import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getRelativeColor } from "../utils/weatherUtils.ts";
import { GEO_ORDER, CITY_TO_PROVINCE } from "../constants/regions";
import styles from "../../../App.module.css";

function CesiumMap({ weatherList, minT, maxT, onRegionClick }) {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const selectedEntityRef = useRef(null);
  const clickCallbackRef = useRef(onRegionClick);

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
        // 이전 선택 영역은 색상(material)은 그대로 두고, 강조 스타일만 원복
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

        if (clickCallbackRef.current) {
          clickCallbackRef.current({
            fullName,
            mappingName,
            screenPosition: { x: click.position.x, y: click.position.y },
          });
        }
      } else {
        selectedEntityRef.current = null;
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
        entity.polygon.outlineColor = Cesium.Color.WHITE.withAlpha(0.5);
        entity.polygon.outlineWidth = 1;
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

