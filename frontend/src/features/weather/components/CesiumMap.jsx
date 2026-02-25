import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { getRelativeColor } from "../utils/weatherUtils.ts";
import { GEO_ORDER, CITY_TO_PROVINCE } from "../constants/regions";
import styles from "../../../App.module.css";

const OUTLINE_COLOR = Cesium.Color.fromCssColorString("#222222").withAlpha(0.88);
const OUTLINE_WIDTH = 2;
const BASE_HEIGHT = 1;

function CesiumMap({ weatherList, minT, maxT, onRegionClick }) {
  const cesiumContainer = useRef(null);
  const viewerRef = useRef(null);
  const selectedEntityRef = useRef(null);
  const selectedEntityNameRef = useRef(null);
  const selectedEntityMaterialRef = useRef(null);
  const weatherDataRef = useRef({ weatherList: [], minT: 0, maxT: 0 });
  const clickCallbackRef = useRef(onRegionClick);

  useEffect(() => {
    weatherDataRef.current = { weatherList, minT, maxT };
  }, [weatherList, minT, maxT]);

  useEffect(() => {
    clickCallbackRef.current = onRegionClick;
  }, [onRegionClick]);

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
      console.log("--- Click Event Started ---");
      const pickedObject = viewer.scene.pick(click.position);

      if (selectedEntityRef.current) {
        const prev = selectedEntityRef.current;
        const prevName = selectedEntityNameRef.current;
        console.log(`Deselecting: ${prevName}`);

        prev.polygon.outlineColor = OUTLINE_COLOR;
        prev.polygon.outlineWidth = OUTLINE_WIDTH;
        prev.polygon.extrudedHeight = BASE_HEIGHT;

        const { weatherList: wl, minT: mn, maxT: mx } = weatherDataRef.current;
        const regionData = wl.find((d) => d.name === prevName);

        if (regionData) {
          const newColor = getRelativeColor(regionData.tmp, mn, mx);
          console.log(`Restoring color for ${prevName}: ${newColor}`);
          prev.polygon.material = Cesium.Color.fromCssColorString(newColor);
        } else if (selectedEntityMaterialRef.current) {
          console.warn(`Data not found for ${prevName}, using fallback material`);
          prev.polygon.material = selectedEntityMaterialRef.current;
        }
      }

      if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        const fullName = entity.properties.name?._value || "Unknown";
        console.log(`Selected: ${fullName}`);

        // 현재 적용되어 있는 색상 확인
        console.log("Current Material before animation:", entity.polygon.material);

        selectedEntityMaterialRef.current = entity.polygon.material;

        let h = 0;
        entity.polygon.outlineColor = Cesium.Color.GRAY;
        entity.polygon.outlineWidth = 4;

        // 애니메이션 작동 로그
        entity.polygon.extrudedHeight = new Cesium.CallbackProperty(() => {
          if (h < 30000) h += 10000;
          return h;
        }, false);

        selectedEntityRef.current = entity;

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

        selectedEntityNameRef.current = mappingName;
        console.log(`Mapped Name: ${mappingName}`);

        if (clickCallbackRef.current) {
          clickCallbackRef.current({
            fullName,
            mappingName,
            screenPosition: { x: click.position.x, y: click.position.y },
          });
        }
      } else {
        console.log("Clicked on empty space");
        selectedEntityRef.current = null;
        selectedEntityNameRef.current = null;
        selectedEntityMaterialRef.current = null;
        if (clickCallbackRef.current) {
          clickCallbackRef.current(null);
        }
      }

      viewer.scene.requestRender();
      console.log("--- Click Event Finished ---");
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.destroy();
      viewer.destroy();
    };
  }, []);

  const updateMapColors = (ds, sorted, localMinT, localMaxT) => {
    console.log("Updating Map Colors...");
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
        entity.polygon.extrudedHeight = BASE_HEIGHT;
      }
    });
    console.log("Map Colors Updated");
    viewerRef.current.scene.requestRender();
  };

  useEffect(() => {
    if (!viewerRef.current) return;
    if (!weatherList || weatherList.length === 0) return;

    const dataSources = viewerRef.current.dataSources;

    if (dataSources.length === 0) {
      console.log("Loading GeoJSON...");
      Cesium.GeoJsonDataSource.load("/data/korea.json").then((ds) => {
        viewerRef.current.dataSources.add(ds);
        console.log("GeoJSON Loaded");
        updateMapColors(ds, weatherList, minT, maxT);
      });
    } else {
      updateMapColors(dataSources.get(0), weatherList, minT, maxT);
    }
  }, [weatherList, minT, maxT]);

  return <div ref={cesiumContainer} className={styles.cesiumContainer} />;
}

export default CesiumMap;