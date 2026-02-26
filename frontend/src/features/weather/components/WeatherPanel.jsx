// Purpose: 드래그 가능한 전국 기온 패널 — 지역별 기온 목록 및 시간 선택 표시
import { useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { getRelativeColor } from '../utils/weatherUtils.ts';
import styles from '../../../App.module.css';

function WeatherPanel({ weatherList, availableHours, selectedHour, setSelectedHour, isMobile, minT, maxT }) {
    const nodeRef = useRef(null);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);

    // 시간 선택 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = () => setIsTimePickerOpen(false);
        if (isTimePickerOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isTimePickerOpen]);

    return (
        <Draggable
            nodeRef={nodeRef}
            bounds="parent"
            handle=".drag-handle"
            cancel=".no-drag"
        >
            <div
                ref={nodeRef}
                className={styles.weatherPanel}
                style={{ width: isMobile ? (isCollapsed ? 'auto' : '140px') : '180px' }}
            >
                <div style={{ marginBottom: isCollapsed ? '0' : '8px' }}>
                    <div className={`drag-handle ${styles.panelHeader}`}>
                        {isCollapsed ? (
                            <span className={styles.panelTitleIcon}>🌡️</span>
                        ) : (
                            <div className={styles.panelTitleRow}>
                                <span className={styles.panelTitle}>전국 기온</span>
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
                        <button
                            className={`no-drag ${styles.collapseBtn}`}
                            onClick={() => setIsCollapsed(!isCollapsed)}
                        >
                            {isCollapsed ? '펼치기' : '접기'}
                        </button>
                    </div>

                    {/* 시간 선택 드롭다운 */}
                    {!isCollapsed && isTimePickerOpen && (
                        <div
                            className={`no-drag ${styles.timePickerDropdown}`}
                            onClick={(e) => e.stopPropagation()}
                        >
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
                                            setSelectedHour(hour);
                                            setIsTimePickerOpen(false);
                                        }}
                                    >
                                        {hour.toString().padStart(2, '0')}시
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 지역별 기온 리스트 */}
                {!isCollapsed && (
                    <div className={styles.weatherList}>
                        {weatherList.map((item) => (
                            <div key={item.name} className={styles.weatherListItem}>
                                <span>{item.name}</span>
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
