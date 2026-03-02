// Purpose: Cesium viewer 초기화 및 날씨 데이터 연동 커스텀 훅

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 훅의 역할
 * ─────────────────────────────────────────────────────────────────
 *  Cesium 3D 지구본을 초기화하고, 날씨 데이터를 지도에 색상으로 표시하며,
 *  지역 클릭 이벤트를 처리하는 모든 로직을 담당.
 *
 *  사용하는 컴포넌트: CesiumMap.jsx
 *    const cesiumContainer = useCesiumMap({ weatherList, minT, maxT, onRegionClick });
 *    return <div ref={cesiumContainer} style={{...}} />;
 *
 *  jQuery 비유:
 *    $('#map').someMapPlugin({ data: weatherList, onClick: handler }) 처럼
 *    DOM 요소에 지도 플러그인을 초기화하는 것과 유사.
 *    단, React에서는 DOM 요소를 ref로 참조하고 useEffect 안에서 초기화.
 *
 *  Cesium 개요:
 *    WebGL 기반 3D 지구본 라이브러리.
 *    Viewer = 전체 3D 뷰어 컨테이너 (카메라, 렌더링 엔진, 이벤트 처리 포함)
 *    Entity  = 3D 공간에 놓인 객체 (폴리곤, 포인트, 라벨 등)
 *    DataSource = 여러 Entity를 담는 컬렉션 (GeoJSON 파일 1개 = 1 DataSource)
 * ─────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { updateMapColors, handleCesiumClick } from "../utils/cesiumUtils.js";

/**
 * useCesiumMap 훅
 *
 * @param {Object} params
 * @param {Array}  params.weatherList  - 날씨 데이터 배열. 각 요소: { name, tmp, hum, ... }
 * @param {number} params.minT         - 현재 데이터의 최저 기온 (색상 범위 계산용)
 * @param {number} params.maxT         - 현재 데이터의 최고 기온 (색상 범위 계산용)
 * @param {Function} params.onRegionClick - 지역 클릭 시 호출될 콜백. 인자: { fullName, mappingName, screenPosition } 또는 null
 *
 * @returns {React.RefObject} cesiumContainer - Cesium Viewer를 마운트할 DOM div 요소의 ref
 *   CesiumMap.jsx에서 <div ref={cesiumContainer}> 에 사용.
 */
export function useCesiumMap({ weatherList, minT, maxT, onRegionClick }) {

  // ── DOM ref ──────────────────────────────────────────────────
  /**
   * cesiumContainer: Cesium Viewer가 렌더링될 div DOM 요소 참조.
   * 반환값으로 CesiumMap.jsx의 <div ref={cesiumContainer}> 에 연결됨.
   * Cesium.Viewer(cesiumContainer.current, ...) 로 초기화 시 사용.
   *
   * jQuery 비유:
   *   $('#cesium-container') 로 선택한 DOM 요소와 유사.
   *   단, React에서는 DOM 직접 접근 대신 ref를 사용.
   */
  const cesiumContainer = useRef(null);

  // ── Cesium 인스턴스 refs ─────────────────────────────────────
  /**
   * viewerRef: Cesium Viewer 인스턴스 보관.
   * 초기화 후 weatherList 변경 시 이 ref로 DataSource에 접근.
   * state가 아닌 ref를 사용하는 이유:
   *   Viewer가 바뀌어도 화면을 다시 그릴 필요가 없음 (Cesium이 자체적으로 렌더링).
   */
  const viewerRef = useRef(null);

  /**
   * selectedOverlayRef: 선택 강조(솟아오른 영역) 전용 오버레이 Entity.
   * 기본 지도 폴리곤은 건드리지 않고, 선택 효과는 이 오버레이만 생성/제거한다.
   */
  const selectedOverlayRef = useRef(null);

  /**
   * overlayAnimationFrameRef: 선택 오버레이 상승 애니메이션 requestAnimationFrame ID.
   * 새 선택/해제 시 기존 애니메이션을 취소해 상태 꼬임을 방지한다.
   */
  const overlayAnimationFrameRef = useRef(null);

  /**
   * clickCallbackRef: onRegionClick 콜백 함수의 최신 버전 보관.
   * Cesium 클릭 핸들러가 stale closure를 참조하지 않도록 ref 사용.
   * 클릭 핸들러가 항상 최신 콜백을 호출하도록 보장.
   */
  const clickCallbackRef = useRef(onRegionClick);

  // ── Ref 동기화 useEffect ─────────────────────────────────────
  /**
   * 콜백 ref 동기화:
   * onRegionClick 함수가 바뀔 때마다 clickCallbackRef.current 업데이트.
   */
  useEffect(() => {
    clickCallbackRef.current = onRegionClick;
  }, [onRegionClick]);

  // ── Cesium Viewer 초기화 (마운트 1회) ───────────────────────
  /**
   * Cesium Viewer를 생성하고 이벤트 핸들러를 등록하는 핵심 useEffect.
   * 의존성 배열 []: 마운트 시 1회만 실행.
   *
   * Cesium.Viewer 옵션 설명:
   *   terrainProvider: null    → 지형(산/평야) 없는 평평한 지구본
   *   animation: false         → 좌측 하단 시간 애니메이션 컨트롤 숨김
   *   timeline: false          → 하단 타임라인 바 숨김
   *   baseLayerPicker: false   → 우측 상단 배경 지도 선택 버튼 숨김
   *   infoBox: false           → 엔티티 클릭 시 정보 박스 팝업 숨김 (커스텀 UI 사용)
   *   selectionIndicator: false → 선택된 엔티티 위 녹색 원 표시 숨김
   *   fullscreenButton: true   → 전체화면 버튼 표시
   *   requestRenderMode: true  → 변경이 있을 때만 렌더링 (성능 최적화, CPU 절약)
   *   maximumRenderTimeChange: Infinity → requestRenderMode와 함께: 변경 없으면 렌더링 안 함
   *   creditContainer: document.createElement("div") → Cesium 워터마크 숨기기
   *     (기본값: 화면에 "Cesium ion" 문구 표시됨, 빈 div에 넣어서 화면에서 제거)
   */
  useEffect(() => {
    if (!cesiumContainer.current) return; // ref가 아직 DOM에 연결되지 않은 경우 방어

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

    /**
     * 초기 카메라 위치 설정:
     * Cesium.Cartesian3.fromDegrees(경도, 위도, 높이(m)):
     *   경도 127.5, 위도 36.0 = 대한민국 대략 중심
     *   높이 1,300,000m = 1300km 상공 (한반도 전체가 보이는 거리)
     *
     * jQuery 비유: 지도 초기화 시 center 좌표와 zoom 레벨 설정하는 것과 동일.
     *   $('#map').mapPlugin({ center: [36.0, 127.5], zoom: 7 });
     */
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(127.5, 36.0, 1300000.0),
      orientation: {
        heading: 0.0,
        pitch: Cesium.Math.toRadians(-80.0),
        roll: 0.0,
      },
    });

    /**
     * ScreenSpaceEventHandler: Cesium의 마우스/터치 이벤트 핸들러.
     * jQuery의 $(canvas).on('click', fn) 과 유사하나,
     * Cesium의 3D 좌표계를 이해하는 이벤트 처리를 제공.
     *
     * viewer.scene.canvas: Cesium이 렌더링하는 WebGL canvas DOM 요소.
     */
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

    /**
     * refs 객체로 모든 ref를 handleCesiumClick에 전달:
     * handleCesiumClick은 cesiumUtils.js에 정의된 순수 함수.
     * 직접 ref 변수들에 접근할 수 없으므로 객체로 묶어서 전달.
     *
     * jQuery 비유:
     *   var context = { selectedEl: null, data: {} };
     *   $canvas.on('click', function(e) { handleClick(e, context); });
     */
    const refs = { selectedOverlayRef, overlayAnimationFrameRef, clickCallbackRef };

    /**
     * LEFT_CLICK 이벤트에 클릭 핸들러 등록:
     * Cesium.ScreenSpaceEventType.LEFT_CLICK = 마우스 왼쪽 버튼 클릭
     * (MIDDLE_CLICK, RIGHT_CLICK, MOUSE_MOVE 등도 있음)
     *
     * click 인자: { position: Cesium.Cartesian2 } = 화면상 픽셀 좌표 {x, y}
     */
    handler.setInputAction(
      (click) => handleCesiumClick(click, viewer, refs),
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );

    /**
     * 클린업 함수:
     * 컴포넌트 언마운트 시 Cesium 리소스 정리.
     *
     * handler.destroy(): 이벤트 핸들러 등록 해제 + 내부 리소스 해제.
     * viewer.destroy(): WebGL 컨텍스트, 텍스처, 버퍼 등 모든 GPU 리소스 해제.
     *   이를 안 하면 페이지 이동 후에도 WebGL 리소스가 메모리에 남음 (메모리 누수).
     *
     * jQuery 비유: $.fn.plugin('destroy') 처럼 플러그인 정리.
     */
    return () => {
      if (overlayAnimationFrameRef.current) {
        cancelAnimationFrame(overlayAnimationFrameRef.current);
        overlayAnimationFrameRef.current = null;
      }
      if (selectedOverlayRef.current) {
        viewer.entities.remove(selectedOverlayRef.current);
        selectedOverlayRef.current = null;
      }
      handler.destroy();
      viewer.destroy();
    };
  }, []); // 빈 배열: 마운트 1회만

  // ── 날씨 데이터 변경 시 색상 갱신 ────────────────────────────
  /**
   * weatherList가 바뀔 때마다 지도 색상을 다시 그리는 useEffect.
   * 의존성 배열 [weatherList, minT, maxT]: 세 값 중 하나라도 바뀌면 실행.
   *
   * 두 가지 시나리오:
   *   1. GeoJSON 최초 로드: dataSources.length === 0이면 korea.json을 로드하고 색상 적용.
   *   2. 데이터 변경(시간 선택 등): 이미 로드된 DataSource에 색상만 갱신.
   *
   * Cesium.GeoJsonDataSource.load("/data/korea.json"):
   *   public 폴더의 korea.json (대한민국 시도 경계 GeoJSON) 로드.
   *   Promise 반환. .then(ds => ...) 으로 로드 완료 후 처리.
   *   jQuery: $.ajax('/data/korea.json', { success: function(ds) {...} }) 와 유사.
   *
   * viewerRef.current.dataSources:
   *   Viewer에 추가된 DataSource 목록.
   *   .add(ds): DataSource를 Viewer에 추가 (3D 지도에 표시).
   *   .get(0): 첫 번째 DataSource 반환.
   *   .length: 현재 DataSource 개수.
   */
  useEffect(() => {
    if (!viewerRef.current) return; // viewer가 아직 초기화되지 않은 경우 방어
    if (!weatherList || weatherList.length === 0) return; // 데이터 없으면 건너뜀

    const dataSources = viewerRef.current.dataSources;

    if (dataSources.length === 0) {
      // GeoJSON 최초 로드 (앱 시작 후 첫 번째 날씨 데이터 수신 시)
      Cesium.GeoJsonDataSource.load("/data/korea.json").then((ds) => {
        viewerRef.current.dataSources.add(ds);
        updateMapColors(ds, weatherList, minT, maxT, viewerRef.current, true);
      });
    } else {
      // 이미 GeoJSON이 로드된 상태 → 색상만 갱신 (재로드 없음)
      updateMapColors(dataSources.get(0), weatherList, minT, maxT, viewerRef.current, false);
    }
  }, [weatherList, minT, maxT]);

  /**
   * 반환값: Cesium Viewer가 마운트될 div DOM 요소의 ref.
   * CesiumMap.jsx에서 <div ref={cesiumContainer} style={{...}} /> 에 사용.
   */
  return cesiumContainer;
}
