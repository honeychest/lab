// Purpose: Cesium 지도 관련 상수, 색상 업데이트 및 클릭 핸들러 유틸리티
import * as Cesium from "cesium";
import { getRelativeColor } from "./weatherUtils.ts";
import { GEO_ORDER, CITY_TO_PROVINCE } from "../constants/regions";

// 경계선 색상 상수 — 기온 색(파랑·하늘·노랑·주황·빨강) 전체 구간에서 눈에 띄도록 어두운 색 사용
// WHITE.withAlpha(0.5) 은 노랑 구간과 섞여 거의 안 보임
export const OUTLINE_COLOR = Cesium.Color.fromCssColorString("#222222").withAlpha(0.88);
export const OUTLINE_WIDTH = 2;
// ⚠️ 0으로 설정하면 Cesium이 ExtrudedPolygon → Polygon 타입 전환을 하면서
// GPU 버퍼를 완전히 새로 생성 → 투명 프레임 발생.
// 1m로 유지하면 항상 ExtrudedPolygon 타입이므로 타입 전환 없이 높이값만 변경됨.
export const BASE_HEIGHT = 1;

// 날씨 데이터 기준으로 GeoJSON 엔티티 색상 갱신
export function updateMapColors(ds, sorted, localMinT, localMaxT, viewer) {
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

  viewer.scene.requestRender();
}

// 지도 클릭 이벤트 처리 — 선택/해제 시 스타일 변경 및 콜백 실행
export function handleCesiumClick(click, viewer, refs) {
  const { selectedEntityRef, selectedEntityNameRef, selectedEntityMaterialRef, weatherDataRef, clickCallbackRef } = refs;
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
}
