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
import { getRelativeColor } from "./weatherUtils.ts";
import { GEO_ORDER, CITY_TO_PROVINCE } from "../constants/regions";

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
export const BASE_HEIGHT = 1;

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
export function updateMapColors(ds, sorted, localMinT, localMaxT, viewer) {
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

  // 색상 변경 후 화면 다시 그리기 요청
  viewer.scene.requestRender();
}

/**
 * handleCesiumClick: Cesium 지도에서 지역 클릭 시 처리 함수.
 *
 * @param {Object} click  - Cesium LEFT_CLICK 이벤트 객체. { position: Cartesian2 }
 *   click.position.x, click.position.y = 클릭된 화면 픽셀 좌표
 *
 * @param {Cesium.Viewer} viewer - Cesium Viewer 인스턴스
 *
 * @param {Object} refs - useCesiumMap.js에서 전달된 ref 객체들
 *   selectedEntityRef       - 현재 선택된 Entity ref
 *   selectedEntityNameRef   - 선택된 지역 매핑 이름 ref
 *   selectedEntityMaterialRef - 선택 전 색상 저장 ref (fallback)
 *   weatherDataRef          - 최신 날씨 데이터 ref
 *   clickCallbackRef        - 부모 컴포넌트에 전달할 콜백 ref
 *
 * 처리 흐름:
 *   [A] 이전 선택 영역 스타일 복원
 *   [B] viewer.scene.pick()으로 클릭된 엔티티 확인
 *   [C] 엔티티가 있으면 → 선택 스타일(돌출 높이 증가, 경계선 강조) 적용 + 콜백
 *   [D] 빈 공간 클릭이면 → 선택 초기화 + null 콜백
 *
 * viewer.scene.pick(position):
 *   화면의 특정 픽셀 위치에 있는 Cesium 객체를 반환.
 *   클릭한 위치에 폴리곤이 있으면 { id: Entity } 반환,
 *   아무것도 없으면 undefined 반환.
 *   jQuery: $(e.target).closest('[data-region]') 처럼 클릭된 요소 찾기와 유사.
 *
 * Cesium.defined(pickedObject):
 *   pickedObject가 undefined/null이 아닌지 확인하는 Cesium 유틸.
 *   JavaScript의 pickedObject != null 과 동일하나 Cesium 관례상 사용.
 *
 * CallbackProperty:
 *   Cesium의 동적 속성. 매 렌더링 프레임마다 함수를 호출해 값을 계산.
 *   아래에서 extrudedHeight에 사용해 선택 시 높이가 점점 올라가는 애니메이션 구현.
 *   false = 값이 시간에 따라 변함 (isConstant = false).
 *
 * 돌출 높이 애니메이션:
 *   let h = 0;
 *   CallbackProperty(() => { if (h < 30000) h += 10000; return h; })
 *   매 프레임 h가 10000씩 증가해서 0 → 10000 → 20000 → 30000m 에서 멈춤.
 *   jQuery의 animate({ height: 30000 }) 와 유사한 효과를 Cesium에서 구현.
 */
export function handleCesiumClick(click, viewer, refs) {
  const { selectedEntityRef, selectedEntityNameRef, selectedEntityMaterialRef, weatherDataRef, clickCallbackRef } = refs;

  // [B] 클릭 위치의 Cesium 엔티티 감지
  const pickedObject = viewer.scene.pick(click.position);

  // [A] 이전 선택 영역 스타일 복원
  if (selectedEntityRef.current) {
    const prev = selectedEntityRef.current;

    // 경계선 원래대로 복원
    prev.polygon.outlineColor = OUTLINE_COLOR;
    prev.polygon.outlineWidth = OUTLINE_WIDTH;

    // 높이 복원: 0 대신 BASE_HEIGHT(1) → ExtrudedPolygon 타입 유지
    prev.polygon.extrudedHeight = BASE_HEIGHT;

    // 기온 색상 복원 (2단계 시도)
    const { weatherList: wl, minT: mn, maxT: mx } = weatherDataRef.current;

    // 1단계: weatherDataRef에서 이 지역 데이터 검색해 색상 재계산
    const regionData = wl.find((d) => d.name === selectedEntityNameRef.current);
    if (regionData) {
      prev.polygon.material = Cesium.Color.fromCssColorString(
          getRelativeColor(regionData.tmp, mn, mx)
      );
    } else if (selectedEntityMaterialRef.current) {
      // 2단계 fallback: 클릭 전에 저장해둔 색상으로 복원
      prev.polygon.material = selectedEntityMaterialRef.current;
    }
  }

  if (Cesium.defined(pickedObject) && pickedObject.id) {
    // [C] 폴리곤(지역)을 클릭한 경우

    const entity = pickedObject.id;

    // 클릭 전 현재 색상을 fallback용으로 저장
    selectedEntityMaterialRef.current = entity.polygon.material;

    // 선택 스타일 적용: 경계선 강조
    let h = 0; // 높이 애니메이션 초기값
    entity.polygon.outlineColor = Cesium.Color.GRAY;
    entity.polygon.outlineWidth = 4;

    /**
     * extrudedHeight 애니메이션:
     *   CallbackProperty = 매 렌더 프레임마다 호출되는 함수.
     *   h가 30000 미만이면 10000씩 증가 → 30000m(30km)에서 멈춤.
     *   지도에서 선택된 지역이 3D 기둥처럼 솟아오르는 효과.
     */
    entity.polygon.extrudedHeight = new Cesium.CallbackProperty(() => {
      if (h < 30000) h += 10000;
      return h;
    }, false);

    // 현재 선택 상태 업데이트
    selectedEntityRef.current = entity;

    // GeoJSON 이름에서 날씨 데이터 매핑 이름 추출
    // (updateMapColors와 동일한 로직으로 이름 변환)
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

    // deselect 시 색상 재계산을 위해 매핑 이름 저장
    selectedEntityNameRef.current = mappingName;

    // 부모 컴포넌트에 클릭 정보 전달
    // 날씨 패널 표시, 지역 이름 표시 등에 사용됨
    if (clickCallbackRef.current) {
      clickCallbackRef.current({
        fullName,        // GeoJSON 원본 이름 (예: "서울특별시")
        mappingName,     // 날씨 데이터 매핑 이름 (예: "서울")
        screenPosition: { x: click.position.x, y: click.position.y }, // 화면 픽셀 좌표
      });
    }
  } else {
    // [D] 빈 공간(폴리곤 아닌 곳) 클릭 → 선택 초기화
    selectedEntityRef.current = null;
    selectedEntityNameRef.current = null;
    selectedEntityMaterialRef.current = null;
    if (clickCallbackRef.current) {
      clickCallbackRef.current(null); // null 전달 = 선택 해제 알림
    }
  }

  // 변경 사항 화면에 반영 (requestRenderMode: true 환경에서 필수)
  viewer.scene.requestRender();
}
