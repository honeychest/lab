// Purpose: Cesium 지도 관련 상수, 색상 업데이트 및 클릭 핸들러 유틸리티

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 파일의 역할
 * ─────────────────────────────────────────────────────────────────
 *  useCesiumMap.js 훅에서 사용하는 순수 유틸리티 함수 모음.
 *  Cesium 특화 로직(색상 갱신, 클릭 처리)을 훅에서 분리하여 가독성 향상.
 *
 *  "순수 함수"란:
 *    같은 입력에 대해 항상 같은 출력 (부수효과 없음).
 *    단, Cesium entity를 직접 수정하므로 완전한 순수 함수는 아님.
 *    (Cesium Entity는 내부 상태를 가진 객체라 불가피)
 *
 *  포함 내용:
 *    - 상수: OUTLINE_COLOR, OUTLINE_WIDTH, BASE_HEIGHT
 *    - updateMapColors(): GeoJSON 엔티티에 기온 색상 적용
 *    - handleCesiumClick(): 지역 클릭/해제 처리
 * ─────────────────────────────────────────────────────────────────
 */
import * as Cesium from "cesium";
import { getRelativeColor } from "../../../domain/weather/lib/weatherUtils.ts";
import { GEO_ORDER, CITY_TO_PROVINCE } from "../model/regions.ts";

// ─────────────────────────────────────────────────────────────────
//  상수 정의
// ─────────────────────────────────────────────────────────────────

/**
 * OUTLINE_COLOR: 지도 경계선 색상.
 *
 * 경계선 색상 선택 이유:
 *   기온에 따라 지도 색상이 파랑(저온) ~ 빨강(고온)으로 변함.
 *   흰색 경계선은 노랑 구간에서 잘 안 보임.
 *   어두운 색(#222222)이 모든 기온 색상 위에서 눈에 띔.
 *
 * Cesium.Color.fromCssColorString():
 *   CSS 색상 문자열을 Cesium Color 객체로 변환.
 *   jQuery에서 $('#el').css('color', '#222222') 처럼 색상 설정하는 것과 유사.
 *
 * .withAlpha(0.88):
 *   투명도 88% (0=완전 투명, 1=완전 불투명).
 *   완전 불투명보다 약간 투명하게 해서 더 자연스럽게 보임.
 */
export const OUTLINE_COLOR = Cesium.Color.fromCssColorString("#222222").withAlpha(0.88);

/**
 * OUTLINE_WIDTH: 경계선 두께 (픽셀 단위).
 * 2px = 가늘지만 눈에 보이는 적당한 두께.
 */
export const OUTLINE_WIDTH = 2;

/**
 * BASE_HEIGHT: 기본 돌출 높이 (미터 단위).
 *
 * ⚠️ 절대 0으로 바꾸지 말 것 (중요한 Cesium 버그 우회 설정):
 *
 * 문제:
 *   extrudedHeight=0으로 설정하면 Cesium이
 *   "ExtrudedPolygon" 타입 → "Polygon" 타입으로 내부 전환을 시도함.
 *   이 타입 전환 시 GPU 버퍼를 완전히 새로 생성하고,
 *   그 과정에서 polygon.material(기온 색상)이 초기화되어 투명해짐.
 *   (이를 "투명 프레임" 또는 "깜빡임" 현상이라고 부름)
 *
 * 해결:
 *   1m = 눈에 거의 보이지 않는 높이지만 "ExtrudedPolygon 타입"을 유지.
 *   타입 전환이 없으므로 색상이 초기화되지 않음.
 *   선택 시 extrudedHeight를 0→30000m로 애니메이션 하고,
 *   해제 시 1로 돌려놓음 (0이 아닌 1).
 */
export const BASE_HEIGHT = 0;

// ─────────────────────────────────────────────────────────────────
//  함수 정의
// ─────────────────────────────────────────────────────────────────

/**
 * updateMapColors: GeoJSON DataSource의 모든 엔티티에 날씨 기온 색상을 적용.
 *
 * @param {Cesium.GeoJsonDataSource} ds        - korea.json에서 로드된 DataSource
 * @param {Array}                    sorted    - 날씨 데이터 배열 [{ name, tmp }, ...]
 * @param {number}                   localMinT - 현재 데이터셋 기준 최저 기온
 * @param {number}                   localMaxT - 현재 데이터셋 기준 최고 기온
 * @param {Cesium.Viewer}             viewer    - Cesium Viewer 인스턴스 (렌더 요청용)
 *
 * 처리 흐름:
 *   1. ds.entities.values: 모든 GeoJSON 엔티티 배열 (시도별 폴리곤)
 *      예: 서울특별시, 경기도, 강원도, ... 17개 폴리곤
 *
 *   2. entity.properties.name?._value:
 *      GeoJSON의 name 속성값 (예: "서울특별시", "경기도")
 *      Cesium Entity는 GeoJSON 속성을 Property 객체로 래핑함.
 *      ._value 로 실제 값에 접근.
 *      ?. = optional chaining: properties.name이 없으면 undefined 반환 (에러 방지)
 *
 *   3. CITY_TO_PROVINCE와 GEO_ORDER로 GeoJSON 이름 → 날씨 데이터 이름 매핑:
 *      GeoJSON: "서울특별시" → 날씨 데이터: "서울"
 *      GeoJSON: "광역시" 포함 이름들 → CITY_TO_PROVINCE로 매핑
 *
 *   4. getRelativeColor(tmp, minT, maxT):
 *      기온을 min~max 범위 내 상대 위치로 계산해 색상(파랑~빨강) 반환.
 *      (weatherUtils.ts 참고)
 *
 *   5. entity.polygon.material = Cesium.Color:
 *      폴리곤 채우기 색상 설정.
 *      entity.polygon.outlineColor/Width: 경계선 색상/두께.
 *      entity.polygon.extrudedHeight: 폴리곤을 지면에서 돌출시킬 높이.
 *
 *   6. viewer.scene.requestRender():
 *      Cesium에 "화면을 다시 그려라" 요청.
 *      requestRenderMode: true 설정 시 자동 렌더링이 없으므로 명시 호출 필요.
 *      jQuery 비유: 없음 (DOM 변경은 자동 반영되지만 WebGL은 수동 요청 필요)
 */
export function updateMapColors(ds, sorted, localMinT, localMaxT, viewer, isFirstLoad = false) {
  ds.entities.values.forEach((entity) => {
    // GeoJSON에서 이 폴리곤의 지역명 읽기
    // 예: "서울특별시", "부산광역시", "경기도" 등
    const name = entity.properties.name?._value || "";

    // GeoJSON 이름 → 날씨 데이터 이름 매핑 (2단계 시도)
    // 1단계: CITY_TO_PROVINCE 딕셔너리로 광역시 매핑
    //   예: "부산광역시".includes("부산") → target = "부산"
    let target = null;
    for (const [c, p] of Object.entries(CITY_TO_PROVINCE)) {
      if (name.includes(c)) {
        target = p;
        break;
      }
    }
    // 2단계: CITY_TO_PROVINCE에서 못 찾으면 GEO_ORDER 배열로 직접 매핑
    //   예: "경기도".includes("경기") → target = "경기"
    if (!target) {
      target = GEO_ORDER.find((n) => name.includes(n));
    }

    // target으로 날씨 데이터 검색
    const regionData = sorted.find((d) => d.name === target);

    if (regionData) {
      // 기온(tmp)을 색상으로 변환하여 폴리곤 채우기 색상 설정
      entity.polygon.material = Cesium.Color.fromCssColorString(
          getRelativeColor(regionData.tmp, localMinT, localMaxT)
      );
      entity.polygon.outlineColor = OUTLINE_COLOR;
      entity.polygon.outlineWidth = OUTLINE_WIDTH;
      // 항상 ExtrudedPolygon 타입 유지 (BASE_HEIGHT 주석 참고)
      entity.polygon.extrudedHeight = BASE_HEIGHT;
    }
  });

  // 초기 로드 시 남한 중심으로 카메라 위치 고정
  if (isFirstLoad) {
    viewer.camera.setView({
      // 위도를 34.0으로 더 낮추고, 고도를 1,000,000(1000km)으로 조절하여 남쪽 위주로 배치
      destination: Cesium.Cartesian3.fromDegrees(127.8, 31.0, 1000000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-65), // 각도를 -45도로 완화하여 북쪽 노출 감소
        roll: 0
      }
    });
  } else {
    viewer.scene.requestRender();
  }
}

/**
 * GeoJSON 엔티티 이름에서 패널 표시용 매핑 이름을 계산.
 */
function getMappingName(fullName) {
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
  return mappingName;
}

/**
 * 엔티티 현재 채움색을 안전하게 추출한다.
 * updateMapColors가 Cesium.Color를 직접 할당하므로 대부분 Color 케이스로 처리된다.
 */
function resolveEntityColor(entity, currentTime) {
  const fallback = Cesium.Color.fromCssColorString("#60a5fa");
  const material = entity?.polygon?.material;

  if (!material) return fallback;
  if (material instanceof Cesium.Color) return material.clone();
  if (material instanceof Cesium.ColorMaterialProperty) {
    const color = material.color?.getValue?.(currentTime);
    return color ? color.clone() : fallback;
  }
  return fallback;
}

/**
 * 기존 선택 오버레이 제거 + 진행 중 애니메이션 취소.
 */
function clearSelectionOverlay(viewer, selectedOverlayRef, overlayAnimationFrameRef) {
  if (overlayAnimationFrameRef.current) {
    cancelAnimationFrame(overlayAnimationFrameRef.current);
    overlayAnimationFrameRef.current = null;
  }
  if (selectedOverlayRef.current) {
    const entity = selectedOverlayRef.current;
    entity.show = false;
    // 테두리 잔상이 남지 않도록 높이 값을 즉시 초기화
    entity.polygon.extrudedHeight = 0;
    entity.polygon.height = 0;
    // 3. 엔티티 숨김
    entity.show = false;
    viewer.scene.requestRender();
  }
}

/**
 * 선택 오버레이 엔티티를 1회 생성 후 재사용한다.
 * add/remove 반복으로 인한 프레임 드랍을 줄이기 위함.
 */
function getOrCreateOverlayEntity(viewer, selectedOverlayRef) {
  if (selectedOverlayRef.current) {
    return selectedOverlayRef.current;
  }

  const overlayEntity = viewer.entities.add({
    show: false,
    polygon: {
      hierarchy: undefined,
      material: Cesium.Color.fromCssColorString("#60a5fa").withAlpha(0.95),
      outline: true,
      outlineColor: Cesium.Color.GRAY,
      outlineWidth: 4,
      extrudedHeight: BASE_HEIGHT,
    },
  });
  selectedOverlayRef.current = overlayEntity;
  return overlayEntity;
}

/**
 * 선택 오버레이를 위로 올리는 애니메이션.
 * 기본 폴리곤은 건드리지 않고 오버레이만 변경한다.
 */
function animateOverlayRise(viewer, overlayEntity, overlayAnimationFrameRef) {
  const TARGET_HEIGHT = 10000;
  const DURATION_MS = 200;
  const START_RATIO = 0.25;
  const startTs = performance.now();
  const startHeight = Math.max(BASE_HEIGHT, TARGET_HEIGHT * START_RATIO);

  // 바닥면(height)을 지면보다 아래(-100m)로 내려서 지표면과 겹치는 현상(Z-fighting) 제거
  overlayEntity.polygon.height = -100;

  // 첫 프레임 전에도 즉시 시각 변화가 보이도록 선반영
  overlayEntity.polygon.extrudedHeight = startHeight;
  viewer.scene.requestRender();

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const tick = () => {
    const nowTs = performance.now();
    const elapsed = nowTs - startTs;
    const progress = Math.min(elapsed / DURATION_MS, 1);
    const eased = easeOutCubic(progress);
    const currentHeight = startHeight + (TARGET_HEIGHT - startHeight) * eased;

    overlayEntity.polygon.extrudedHeight = Math.max(BASE_HEIGHT, currentHeight);
    viewer.scene.requestRender();

    if (progress < 1) {
      overlayAnimationFrameRef.current = requestAnimationFrame(tick);
    } else {
      overlayAnimationFrameRef.current = null;
    }
  };

  overlayAnimationFrameRef.current = requestAnimationFrame(tick);
}

/**
 * handleCesiumClick: 선택 효과를 "기본 레이어"와 분리된 오버레이 레이어로 처리.
 * 기본 지도 폴리곤의 material/extrudedHeight를 변경하지 않으므로 투명화 경로를 차단한다.
 */
export function handleCesiumClick(click, viewer, refs) {
  const { selectedOverlayRef, overlayAnimationFrameRef, clickCallbackRef } = refs;

  const pickedObject = viewer.scene.pick(click.position);

  // 항상 이전 오버레이를 먼저 정리하고 시작한다.
  clearSelectionOverlay(viewer, selectedOverlayRef, overlayAnimationFrameRef);

  if (Cesium.defined(pickedObject) && pickedObject.id?.polygon) {
    const baseEntity = pickedObject.id;
    const fullName = baseEntity.properties?.name?._value || "";
    const mappingName = getMappingName(fullName);

    // 선택 색상은 기본 지도 색상을 그대로 복제해 alpha만 높인다.
    const overlayColor = resolveEntityColor(baseEntity, viewer.clock.currentTime).withAlpha(1);

    // 선택 효과 오버레이는 재사용: hierarchy/material만 갱신.
    const overlayEntity = getOrCreateOverlayEntity(viewer, selectedOverlayRef);
    overlayEntity.polygon.hierarchy = baseEntity.polygon.hierarchy;
    overlayEntity.polygon.material = overlayColor;
    overlayEntity.polygon.outlineColor = Cesium.Color.GRAY;
    overlayEntity.polygon.outlineWidth = 4;
    overlayEntity.polygon.extrudedHeight = BASE_HEIGHT;
    overlayEntity.show = true;

    animateOverlayRise(viewer, overlayEntity, overlayAnimationFrameRef);

    if (clickCallbackRef.current) {
      clickCallbackRef.current({
        fullName,
        mappingName,
        screenPosition: { x: click.position.x, y: click.position.y },
      });
    }
  } else if (clickCallbackRef.current) {
    clickCallbackRef.current(null);
  }

  viewer.scene.requestRender();
}
