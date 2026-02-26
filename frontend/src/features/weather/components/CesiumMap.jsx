// Purpose: Cesium 3D 지도 렌더링 컴포넌트 — 날씨 데이터 기반 지역 색상 표시
import { useCesiumMap } from "../hooks/useCesiumMap.js";
import styles from "../../../App.module.css";

function CesiumMap({ weatherList, minT, maxT, onRegionClick }) {
  const cesiumContainer = useCesiumMap({ weatherList, minT, maxT, onRegionClick });

  return <div ref={cesiumContainer} className={styles.cesiumContainer} />;
}

export default CesiumMap;
