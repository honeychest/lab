// [AGENT] 전국 기온 패널 — Draggable 오버레이, 시간 선택 드롭다운, getRelativeColor 기온 색상
// 연관: CesiumPage.jsx, weatherUtils.ts
// Purpose: 드래그 가능한 전국 기온 패널 — 지역별 기온 목록 및 시간 선택 표시

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 컴포넌트의 역할
 * ─────────────────────────────────────────────────────────────────
 *  Cesium 3D 지도 위에 떠있는 오버레이 패널.
 *  - 전국 10개 시도별 현재 기온을 색상과 함께 표시
 *  - 시간대 선택 드롭다운 (00시~현재시)
 *  - 드래그로 위치 이동 가능 (react-draggable 사용)
 *  - 접기/펼치기 토글
 *
 *  Props:
 *    weatherList    - 시도별 날씨 데이터 배열
 *    availableHours - 선택 가능한 시간 목록
 *    selectedHour   - 현재 선택된 시간
 *    setSelectedHour - 시간 변경 함수
 *    isMobile       - 모바일 여부 (패널 너비 조정)
 *    minT, maxT     - 기온 색상 범위
 *
 *  jQuery 비유:
 *    $('#weather-panel').draggable({ containment: '#map' }); 처럼
 *    드래그 기능을 react-draggable 라이브러리로 처리.
 *    단, React 방식이므로 DOM 직접 조작 없이 컴포넌트로 감싸기만 함.
 * ─────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react';

/**
 * react-draggable: 드래그 앤 드롭 라이브러리.
 * <Draggable> 컴포넌트로 감싸면 내부 요소가 드래그 가능해짐.
 * jQuery UI의 .draggable() 플러그인과 동일한 기능.
 * bounds="parent" 옵션으로 부모 영역 밖으로 드래그 불가.
 */
import Draggable from 'react-draggable';

import { getRelativeColor } from '../../lib/weatherUtils.ts';
import styles from '../../../../page/weather/CesiumPage.module.css';

/**
 * WeatherPanel 컴포넌트
 *
 * @param {Array}    weatherList     - 시도별 날씨 데이터. [{ name, tmp, hum, ... }, ...]
 * @param {number[]} availableHours  - 시간 선택 드롭다운에 표시할 시간 목록. 예: [0, 3, 6, ...]
 * @param {number}   selectedHour    - 현재 선택된 시간 (0~23). null이면 '--:00' 표시.
 * @param {Function} setSelectedHour - 시간 선택 시 호출될 함수. (hour: number) => void
 * @param {boolean}  isMobile        - 모바일 기기 여부. true면 패널 너비를 좁게.
 * @param {number}   minT            - 현재 데이터 최저 기온 (색상 범위 하한)
 * @param {number}   maxT            - 현재 데이터 최고 기온 (색상 범위 상한)
 */
function WeatherPanel({ weatherList, availableHours, selectedHour, setSelectedHour, isMobile, minT, maxT }) {

    // ── Refs ─────────────────────────────────────────────────────

    /**
     * nodeRef: react-draggable에 전달하는 DOM ref.
     * react-draggable이 드래그되는 실제 DOM 요소를 참조해야 함.
     * React 17+에서는 findDOMNode 대신 ref를 직접 전달하는 방식 사용.
     * (findDOMNode는 deprecated됨)
     */
    const nodeRef = useRef(null);

    // ── State ────────────────────────────────────────────────────

    /**
     * isCollapsed: 패널 접힘 여부.
     * true  = 패널 접힘 (아이콘만 표시)
     * false = 패널 펼침 (전체 내용 표시)
     *
     * 모바일에서 화면 공간을 절약하기 위해 제공.
     */
    const [isCollapsed, setIsCollapsed] = useState(false);

    /**
     * isTimePickerOpen: 시간 선택 드롭다운의 열림/닫힘 상태.
     * true  = 드롭다운 표시
     * false = 드롭다운 숨김
     */
    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

    // ── 드롭다운 외부 클릭 닫기 useEffect ───────────────────────
    /**
     * 드롭다운이 열려있을 때 외부 영역 클릭 시 자동으로 닫히는 기능.
     *
     * jQuery 비유:
     *   $(document).on('click', function() { closeDropdown(); });
     *   $(dropdown).on('click', function(e) { e.stopPropagation(); });
     *   처럼 전역 클릭 리스너로 드롭다운 닫기를 구현하는 것과 동일.
     *
     * isTimePickerOpen 의존성:
     *   드롭다운이 열릴 때만 리스너 등록 (성능 최적화).
     *   닫혀있을 때는 불필요한 이벤트 리스너 없음.
     *
     * 주의:
     *   드롭다운 자체 클릭 시 onClick에서 e.stopPropagation()으로 이벤트 전파 차단.
     *   그렇지 않으면 드롭다운 안의 버튼 클릭 시 외부 클릭으로 오인해 바로 닫힘.
     *
     * 클린업 함수:
     *   dropldown이 닫히면 (isTimePickerOpen=false) 리스너 제거.
     *   또는 컴포넌트 언마운트 시에도 자동 제거.
     */
    useEffect(() => {
        const handleClickOutside = () => setIsTimePickerOpen(false);
        if (isTimePickerOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isTimePickerOpen]);

    // ── JSX 렌더링 ────────────────────────────────────────────────
    return (
        /**
         * <Draggable>:
         *   nodeRef     - 드래그될 DOM 요소의 ref
         *   bounds="parent" - 부모 요소 영역 안에서만 드래그 허용
         *   handle=".drag-handle" - 이 CSS 클래스를 가진 요소만 드래그 시작점으로 허용
         *                           (버튼, 입력 등 다른 요소 클릭 시 드래그 안 됨)
         *   cancel=".no-drag" - 이 CSS 클래스를 가진 요소 클릭 시 드래그 무시
         *                       (버튼 클릭이 드래그로 오인되는 것 방지)
         *
         * jQuery 비유:
         *   $(nodeRef.current).draggable({
         *     containment: 'parent',
         *     handle: '.drag-handle',
         *     cancel: '.no-drag'
         *   });
         */
        <Draggable
            nodeRef={nodeRef}
            bounds="parent"
            handle=".drag-handle"
            cancel=".no-drag"
        >
            {/*
              패널 컨테이너:
              ref={nodeRef} = Draggable이 참조할 DOM 요소
              isMobile에 따라 너비 동적 조정:
                모바일 + 접힘: 'auto' (아이콘 크기에 맞게)
                모바일 + 펼침: '140px'
                데스크톱: '180px'
            */}
            <div
                ref={nodeRef}
                className={styles.weatherPanel}
                style={{ width: isMobile ? (isCollapsed ? 'auto' : '140px') : '180px' }}
            >
                {/* ── 패널 헤더 영역 ──────────────────────────────── */}
                <div style={{ marginBottom: isCollapsed ? '0' : '8px' }}>
                    {/*
                      drag-handle 클래스: 이 div를 잡고 드래그 가능.
                      버튼에는 no-drag가 있어서 버튼 클릭이 드래그로 오인 안 됨.
                    */}
                    <div className={`drag-handle ${styles.panelHeader}`}>
                        {isCollapsed ? (
                            /* 접힌 상태: 온도계 아이콘만 표시 */
                            <span className={styles.panelTitleIcon}>🌡️</span>
                        ) : (
                            /* 펼친 상태: 제목 + 시간 선택 버튼 */
                            <div className={styles.panelTitleRow}>
                                <span className={styles.panelTitle}>전국 기온</span>

                                {/*
                                  시간 선택 버튼:
                                  no-drag 클래스: 클릭이 드래그로 인식되지 않도록.
                                  e.stopPropagation():
                                    클릭 이벤트가 부모로 전파되지 않도록 차단.
                                    없으면 헤더(drag-handle)까지 클릭 이벤트가 전달되어
                                    드래그 시작으로 오인될 수 있음.
                                    jQuery: e.stopPropagation() 과 완전히 동일.

                                  selectedHour.toString().padStart(2, '0'):
                                    숫자 9 → "09" (2자리로 패딩)
                                    jQuery 비유: (hour < 10 ? '0' : '') + hour 와 동일.
                                */}
                                <button
                                    className={`no-drag ${styles.timePickerBtn}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsTimePickerOpen(!isTimePickerOpen);
                                    }}
                                >
                                    ({selectedHour !== null ? selectedHour.toString().padStart(2, '0') : '--'}:00)
                                    <span className={styles.timePickerArrow}>▼</span>
                                </button>
                            </div>
                        )}

                        {/* 접기/펼치기 버튼 */}
                        <button
                            className={`no-drag ${styles.collapseBtn}`}
                            onClick={() => setIsCollapsed(!isCollapsed)}
                        >
                            {isCollapsed ? '펼치기' : '접기'}
                        </button>
                    </div>

                    {/* ── 시간 선택 드롭다운 ──────────────────────── */}
                    {/*
                      조건부 렌더링:
                      !isCollapsed && isTimePickerOpen = 패널이 펼쳐진 상태에서만 표시.
                      jQuery: $(dropdown).toggle() 과 유사하나
                              React는 조건이 false면 DOM에서 완전히 제거.

                      onClick={e => e.stopPropagation()}:
                        드롭다운 내부 클릭이 document의 handleClickOutside로 전파되지 않도록.
                        없으면 드롭다운 안의 어떤 클릭도 드롭다운을 닫게 됨.
                    */}
                    {!isCollapsed && isTimePickerOpen && (
                        <div
                            className={`no-drag ${styles.timePickerDropdown}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/*
                              시간 버튼 그리드:
                              availableHours.map(): 사용 가능한 시간마다 버튼 생성.
                              jQuery: $.each(availableHours, function(i, hour) { ... }) 와 유사.

                              key={hour}: React가 각 버튼을 구분하는 고유 키.
                              시간 값이 고유하므로 key로 사용 가능.

                              선택된 시간 스타일:
                              hour === selectedHour ? timePickerItemSelected : timePickerItemDefault
                              선택된 시간 버튼에 다른 CSS 클래스 적용.
                              jQuery: $(btn).toggleClass('selected', hour === selectedHour) 와 유사.
                            */}
                            <div className={styles.timePickerGrid}>
                                {availableHours.map(hour => (
                                    <button
                                        key={hour}
                                        className={`${styles.timePickerItem} ${
                                            hour === selectedHour
                                                ? styles.timePickerItemSelected
                                                : styles.timePickerItemDefault
                                        }`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedHour(hour); // 부모 훅에 시간 변경 알림
                                            setIsTimePickerOpen(false); // 드롭다운 닫기
                                        }}
                                    >
                                        {hour.toString().padStart(2, '0')}시
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── 지역별 기온 리스트 ──────────────────────────── */}
                {/*
                  !isCollapsed: 패널이 펼쳐진 상태에서만 표시.

                  weatherList.map((item) => ...):
                    각 시도 데이터를 한 줄 UI로 렌더링.
                    key={item.name}: 지역명이 고유하므로 key로 사용.

                  getRelativeColor(item.tmp, minT, maxT):
                    기온을 minT~maxT 범위의 상대적 위치로 계산해 색상 반환.
                    -1°C(minT)이면 파랑, 12°C(maxT)이면 빨강.
                    중간 온도는 파랑→하늘→노랑→주황→빨강 그라데이션.
                    (weatherUtils.ts 참고)

                  {item.tmp}°:
                    기온 숫자 + 도(°) 기호.
                    item.tmp는 parseFloat으로 변환된 숫자.
                    소수점은 useWeatherData.ts에서 parseFloat(tmp ?? 0)으로 처리됨.
                */}
                {!isCollapsed && (
                    <div className={styles.weatherList}>
                        {weatherList.map((item) => (
                            <div key={item.name} className={styles.weatherListItem}>
                                {/* 지역명 */}
                                <span>{item.name}</span>
                                {/* 기온: getRelativeColor로 색상 동적 적용 */}
                                <span
                                    className={styles.weatherListTemp}
                                    style={{ color: getRelativeColor(item.tmp, minT, maxT) }}
                                >
                                    {item.tmp}°
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Draggable>
    );
}

export default WeatherPanel;
