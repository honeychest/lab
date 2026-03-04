// Purpose: Cesium 3D 지도 렌더링 컴포넌트 — 날씨 데이터 기반 지역 색상 표시
import { useCesiumMap } from "../../model/hook/useCesiumMap.js";
import styles from "../../../../page/weather/CesiumPage.module.css";

function CesiumMap({ weatherList, minT, maxT, onRegionClick }) {
  const cesiumContainer = useCesiumMap({ weatherList, minT, maxT, onRegionClick });

  return <div ref={cesiumContainer} className={styles.cesiumContainer} />;
}

export default CesiumMap;
