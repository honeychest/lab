import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../shared/ui/layout/Layout.jsx';
import { useAdminAuth } from '@/shared/auth/AdminAuthContext.jsx';
import styles from './RandomLayoutEditorPage.module.css';
import {
    BOARD_HEIGHT,
    BOARD_WIDTH,
    DEFLECTORS,
    FUNNEL_LEFT_POINTS,
    GOAL_LEFT_POINTS,
    GOAL_LAYOUT,
    PINS,
    STANDBY_INSET,
    STANDBY_Y,
} from './randomLayout.js';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function buildMirrorPoints(points) {
    return points.map(function (point) {
        return {
            x: BOARD_WIDTH - point.x,
            y: point.y,
        };
    });
}

function buildStandbyPreview(points) {
    var halfWidth = BOARD_WIDTH / 2 - points[0].x - STANDBY_INSET;
    var leftX = BOARD_WIDTH / 2 - halfWidth;
    var width = halfWidth * 2;
    var result = [];
    var count = 10;
    var i = 0;

    while (i < count) {
        var ratio = count > 1 ? i / (count - 1) : 0.5;
        result.push({
            x: leftX + width * ratio,
            y: STANDBY_Y,
        });
        i = i + 1;
    }

    return result;
}

function buildLayoutJson(funnelPoints, goalLayout, goalLeftPoints, deflectors, pins) {
    return [
        'export const FUNNEL_LEFT_POINTS = ' + JSON.stringify(funnelPoints, null, 4) + ';',
        '',
        'export const GOAL_LAYOUT = ' + JSON.stringify(goalLayout, null, 4) + ';',
        '',
        'export const GOAL_LEFT_POINTS = ' + JSON.stringify(goalLeftPoints, null, 4) + ';',
        '',
        'export const DEFLECTORS = ' + JSON.stringify(deflectors, null, 4) + ';',
        '',
        'export const PINS = ' + JSON.stringify(pins, null, 4) + ';',
    ].join('\n');
}

function RandomLayoutEditorPage() {
    var navigate = useNavigate();
    var { canAccess, isForbidden } = useAdminAuth();
    var [funnelPoints, setFunnelPoints] = useState(FUNNEL_LEFT_POINTS);
    var [goalLayout, setGoalLayout] = useState(GOAL_LAYOUT);
    var [goalLeftPoints, setGoalLeftPoints] = useState(GOAL_LEFT_POINTS);
    var [deflectors, setDeflectors] = useState(DEFLECTORS);
    var [pins, setPins] = useState(PINS);
    var [selectedPointIndex, setSelectedPointIndex] = useState(0);
    var [selectedGoalPointIndex, setSelectedGoalPointIndex] = useState(0);
    var [selectedDeflectorIndex, setSelectedDeflectorIndex] = useState(-1);
    var [selectedPinIndex, setSelectedPinIndex] = useState(-1);
    var dragRef = useRef(null);
    var svgRef = useRef(null);

    useEffect(function () {
        if (isForbidden) {
            navigate('/forbidden', { replace: true });
        }
    }, [isForbidden, navigate]);

    var rightPoints = useMemo(function () {
        return buildMirrorPoints(funnelPoints);
    }, [funnelPoints]);

    var standbyBalls = useMemo(function () {
        return buildStandbyPreview(funnelPoints);
    }, [funnelPoints]);

    var layoutJson = useMemo(function () {
        return buildLayoutJson(funnelPoints, goalLayout, goalLeftPoints, deflectors, pins);
    }, [funnelPoints, goalLayout, goalLeftPoints, deflectors, pins]);

    function updatePoint(index, nextPoint) {
        setFunnelPoints(function (current) {
            return current.map(function (point, pointIndex) {
                if (pointIndex !== index) {
                    return point;
                }

                return nextPoint;
            });
        });
    }

    function handleSvgPointerDown(event, pointIndex) {
        var rect = svgRef.current.getBoundingClientRect();
        dragRef.current = {
            type: 'point',
            index: pointIndex,
            rect: rect,
        };
        setSelectedPointIndex(pointIndex);
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function handleDeflectorPointerDown(event, deflectorIndex) {
        var rect = svgRef.current.getBoundingClientRect();
        dragRef.current = {
            type: 'deflector',
            index: deflectorIndex,
            rect: rect,
        };
        setSelectedDeflectorIndex(deflectorIndex);
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function handleGoalPointPointerDown(event, pointIndex) {
        var rect = svgRef.current.getBoundingClientRect();
        dragRef.current = {
            type: 'goal-point',
            index: pointIndex,
            rect: rect,
        };
        setSelectedGoalPointIndex(pointIndex);
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function handlePinPointerDown(event, pinIndex) {
        var rect = svgRef.current.getBoundingClientRect();
        dragRef.current = {
            type: 'pin',
            index: pinIndex,
            rect: rect,
        };
        setSelectedPinIndex(pinIndex);
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event) {
        if (dragRef.current == null) {
            return;
        }

        var rect = dragRef.current.rect;
        var scaleX = BOARD_WIDTH / rect.width;
        var scaleY = BOARD_HEIGHT / rect.height;
        var x = (event.clientX - rect.left) * scaleX;
        var y = (event.clientY - rect.top) * scaleY;

        if (dragRef.current.type === 'point') {
            var pointIndex = dragRef.current.index;
            var prev = funnelPoints[Math.max(0, pointIndex - 1)];
            var next = funnelPoints[Math.min(funnelPoints.length - 1, pointIndex + 1)];
            updatePoint(pointIndex, {
                x: clamp(Math.round(x), 24, BOARD_WIDTH / 2 - 80),
                y: clamp(Math.round(y), prev.y + (pointIndex === 0 ? -40 : 18), next.y - (pointIndex === funnelPoints.length - 1 ? -40 : 18)),
            });
        }

        if (dragRef.current.type === 'deflector') {
            var deflectorIndex = dragRef.current.index;
            setDeflectors(function (current) {
                return current.map(function (deflector, currentIndex) {
                    if (currentIndex !== deflectorIndex) {
                        return deflector;
                    }

                    return {
                        ...deflector,
                        x: clamp(Math.round(x), 40, BOARD_WIDTH - 40),
                        y: clamp(Math.round(y), 80, BOARD_HEIGHT - 80),
                    };
                });
            });
        }

        if (dragRef.current.type === 'goal-point') {
            var goalPointIndex = dragRef.current.index;
            setGoalLeftPoints(function (current) {
                return current.map(function (point, currentIndex) {
                    if (currentIndex !== goalPointIndex) {
                        return point;
                    }

                    var minY = currentIndex === 0 ? 120 : current[currentIndex - 1].y + 18;
                    var maxY = currentIndex === current.length - 1 ? BOARD_HEIGHT - 12 : current[currentIndex + 1].y - 18;

                    return {
                        x: clamp(Math.round(x), 60, BOARD_WIDTH / 2 - 8),
                        y: clamp(Math.round(y), minY, maxY),
                    };
                });
            });
        }

        if (dragRef.current.type === 'pin') {
            var pinIndex = dragRef.current.index;
            setPins(function (current) {
                return current.map(function (pin, currentIndex) {
                    if (currentIndex !== pinIndex) {
                        return pin;
                    }

                    return {
                        ...pin,
                        x: clamp(Math.round(x), 40, BOARD_WIDTH - 40),
                        y: clamp(Math.round(y), 80, BOARD_HEIGHT - 80),
                    };
                });
            });
        }
    }

    function handlePointerUp() {
        dragRef.current = null;
    }

    function updateGoalField(field, value) {
        setGoalLayout(function (current) {
            return {
                ...current,
                [field]: Number(value),
            };
        });
    }

    function addDeflector() {
        setDeflectors(function (current) {
            return current.concat({
                x: Math.round(BOARD_WIDTH / 2),
                y: Math.round(BOARD_HEIGHT / 2),
                width: 120,
                height: 12,
                angle: 0,
                bounce: 0.9,
                motionAmplitude: 0,
                motionSpeed: 0,
                motionPhase: 0,
            });
        });
        setSelectedDeflectorIndex(deflectors.length);
    }

    function updateDeflectorField(index, field, value) {
        setDeflectors(function (current) {
            return current.map(function (deflector, currentIndex) {
                if (currentIndex !== index) {
                    return deflector;
                }

                return {
                    ...deflector,
                    [field]: Number(value),
                };
            });
        });
    }

    function removeDeflector(index) {
        setDeflectors(function (current) {
            return current.filter(function (_, currentIndex) {
                return currentIndex !== index;
            });
        });
        setSelectedDeflectorIndex(-1);
    }

    function addPin() {
        setPins(function (current) {
            return current.concat({
                x: Math.round(BOARD_WIDTH / 2),
                y: Math.round(BOARD_HEIGHT / 2),
                radius: 18,
                bounce: 0.96,
            });
        });
        setSelectedPinIndex(pins.length);
    }

    function updatePinField(index, field, value) {
        setPins(function (current) {
            return current.map(function (pin, currentIndex) {
                if (currentIndex !== index) {
                    return pin;
                }

                return {
                    ...pin,
                    [field]: Number(value),
                };
            });
        });
    }

    function removePin(index) {
        setPins(function (current) {
            return current.filter(function (_, currentIndex) {
                return currentIndex !== index;
            });
        });
        setSelectedPinIndex(-1);
    }

    if (canAccess === null) {
        return (
            <Layout footerCenter={['Random', 'Layout Editor']} enableSupport={false}>
                <section className={styles.pageWrap}>
                    <div className={styles.controlPanel}>
                        <div className={styles.card}>
                            <h3>권한 확인 중</h3>
                            <p className={styles.emptyText}>레이아웃 편집 권한을 확인하고 있습니다.</p>
                        </div>
                    </div>
                </section>
            </Layout>
        );
    }

    if (!canAccess) {
        return (
            <Layout footerCenter={['Random', 'Layout Editor']} enableSupport={false}>
                <section className={styles.pageWrap}>
                    <div className={styles.controlPanel}>
                        <div className={styles.card}>
                            <h3>접근 권한 없음</h3>
                            <p className={styles.emptyText}>이 편집 페이지는 허용된 관리자만 사용할 수 있습니다.</p>
                        </div>
                    </div>
                </section>
            </Layout>
        );
    }

    return (
        <Layout footerCenter={['Random', 'Layout Editor']} enableSupport={false}>
            <section className={styles.pageWrap}>
                <div className={styles.editorGrid}>
                    <section className={styles.previewPanel}>
                        <header className={styles.panelHeader}>
                            <h2>Layout Preview</h2>
                            <p>점은 드래그해서 벽을 움직이고, 장애물은 아래 목록에서 추가/조정합니다.</p>
                        </header>

                        <div className={styles.previewViewport}>
                            <svg
                                ref={svgRef}
                                className={styles.previewSvg}
                                viewBox={'0 0 ' + BOARD_WIDTH + ' ' + BOARD_HEIGHT}
                                preserveAspectRatio="xMidYMid meet"
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerLeave={handlePointerUp}
                            >
                                <rect x="0" y="0" width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="#0a1021" />

                                <polyline
                                    points={funnelPoints.map(function (point) { return point.x + ',' + point.y; }).join(' ')}
                                    fill="none"
                                    stroke="#6282c9"
                                    strokeWidth="10"
                                />
                                <polyline
                                    points={rightPoints.map(function (point) { return point.x + ',' + point.y; }).join(' ')}
                                    fill="none"
                                    stroke="#6282c9"
                                    strokeWidth="10"
                                />

                                <polyline
                                    points={goalLeftPoints.map(function (point) { return point.x + ',' + point.y; }).join(' ')}
                                    fill="none"
                                    stroke="#93aef7"
                                    strokeWidth="12"
                                />
                                <polyline
                                    points={goalLeftPoints.map(function (point) { return (BOARD_WIDTH - point.x) + ',' + point.y; }).join(' ')}
                                    fill="none"
                                    stroke="#93aef7"
                                    strokeWidth="12"
                                />

                                {goalLeftPoints.map(function (point, index) {
                                    return (
                                        <g key={'goal-point-' + index}>
                                            <circle
                                                cx={point.x}
                                                cy={point.y}
                                                r="10"
                                                fill={selectedGoalPointIndex === index ? '#ffd166' : '#8ff0ff'}
                                                stroke="#ffffff"
                                                strokeWidth="3"
                                                onPointerDown={function (event) {
                                                    handleGoalPointPointerDown(event, index);
                                                }}
                                            />
                                            <text x={point.x + 16} y={point.y + 6} fontSize="14" fill="#dce6ff">
                                                G{index}
                                            </text>
                                        </g>
                                    );
                                })}

                                <rect
                                    x={goalLayout.sideMargin}
                                    y={goalLayout.floorY - goalLayout.floorThickness / 2}
                                    width={BOARD_WIDTH / 2 - goalLayout.holeWidth / 2 - goalLayout.sideMargin}
                                    height={goalLayout.floorThickness}
                                    fill="#344773"
                                />
                                <rect
                                    x={BOARD_WIDTH / 2 + goalLayout.holeWidth / 2}
                                    y={goalLayout.floorY - goalLayout.floorThickness / 2}
                                    width={BOARD_WIDTH / 2 - goalLayout.holeWidth / 2 - goalLayout.sideMargin}
                                    height={goalLayout.floorThickness}
                                    fill="#344773"
                                />

                                <rect
                                    x={BOARD_WIDTH / 2 - (goalLayout.holeWidth - 10) / 2}
                                    y={goalLayout.sensorCenterY - goalLayout.sensorHeight / 2}
                                    width={goalLayout.holeWidth - 10}
                                    height={goalLayout.sensorHeight}
                                    fill="rgba(255, 209, 102, 0.22)"
                                    stroke="#ffd166"
                                    strokeWidth="3"
                                    strokeDasharray="10 8"
                                />
                                <text
                                    x={BOARD_WIDTH / 2}
                                    y={goalLayout.sensorCenterY - goalLayout.sensorHeight / 2 - 12}
                                    textAnchor="middle"
                                    fontSize="16"
                                    fontWeight="700"
                                    fill="#ffd166"
                                >
                                    goal sensor
                                </text>

                                {standbyBalls.map(function (ball, index) {
                                    return (
                                        <g key={'ball-' + index}>
                                            <circle cx={ball.x} cy={ball.y} r="18" fill="#e6eefc" stroke="#ffffff" strokeWidth="2" />
                                            <text x={ball.x} y={ball.y + 6} textAnchor="middle" fontSize="14" fontWeight="700" fill="#15223e">
                                                {index + 1}
                                            </text>
                                        </g>
                                    );
                                })}

                                {deflectors.map(function (deflector, index) {
                                    return (
                                        <g
                                            key={'deflector-' + index}
                                            transform={'translate(' + deflector.x + ' ' + deflector.y + ') rotate(' + (deflector.angle * 180 / Math.PI) + ')'}
                                            onPointerDown={function (event) {
                                                handleDeflectorPointerDown(event, index);
                                            }}
                                        >
                                            <rect
                                                x={-deflector.width / 2}
                                                y={-deflector.height / 2}
                                                width={deflector.width}
                                                height={deflector.height}
                                                rx="4"
                                                fill={selectedDeflectorIndex === index ? '#ffd166' : '#6fd0ff'}
                                                opacity="0.92"
                                            />
                                        </g>
                                    );
                                })}

                                {pins.map(function (pin, index) {
                                    return (
                                        <g
                                            key={'pin-' + index}
                                            onPointerDown={function (event) {
                                                handlePinPointerDown(event, index);
                                            }}
                                        >
                                            <circle
                                                cx={pin.x}
                                                cy={pin.y}
                                                r={pin.radius}
                                                fill={selectedPinIndex === index ? '#ffd166' : '#9ab4ff'}
                                                stroke="#ffffff"
                                                strokeWidth="3"
                                            />
                                        </g>
                                    );
                                })}

                                {funnelPoints.map(function (point, index) {
                                    return (
                                        <g key={'point-' + index}>
                                            <circle
                                                cx={point.x}
                                                cy={point.y}
                                                r="11"
                                                fill={selectedPointIndex === index ? '#ffd166' : '#ff7aa2'}
                                                stroke="#ffffff"
                                                strokeWidth="3"
                                                onPointerDown={function (event) {
                                                    handleSvgPointerDown(event, index);
                                                }}
                                            />
                                            <text x={point.x + 16} y={point.y - 12} fontSize="14" fill="#dce6ff">
                                                {index}: {Math.round(point.x)}, {Math.round(point.y)}
                                            </text>
                                        </g>
                                    );
                                })}

                                <line x1={BOARD_WIDTH / 2} y1="0" x2={BOARD_WIDTH / 2} y2={BOARD_HEIGHT} stroke="#29406d" strokeDasharray="8 8" />
                            </svg>
                        </div>
                    </section>

                    <section className={styles.controlPanel}>
                        <div className={styles.card}>
                            <h3>Funnel Points</h3>
                            <div className={styles.pointList}>
                                {funnelPoints.map(function (point, index) {
                                    return (
                                        <button
                                            key={'point-button-' + index}
                                            className={selectedPointIndex === index ? styles.pointButtonActive : styles.pointButton}
                                            onClick={function () {
                                                setSelectedPointIndex(index);
                                            }}
                                        >
                                            P{index} ({Math.round(point.x)}, {Math.round(point.y)})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={styles.card}>
                            <h3>Goal</h3>
                            <div className={styles.pointList}>
                                {goalLeftPoints.map(function (point, index) {
                                    return (
                                        <button
                                            key={'goal-point-button-' + index}
                                            className={selectedGoalPointIndex === index ? styles.pointButtonActive : styles.pointButton}
                                            onClick={function () {
                                                setSelectedGoalPointIndex(index);
                                            }}
                                        >
                                            G{index} ({Math.round(point.x)}, {Math.round(point.y)})
                                        </button>
                                    );
                                })}
                            </div>
                            <label className={styles.field}>
                                <span>Hole Width</span>
                                <input type="number" value={goalLayout.holeWidth} onChange={function (e) { updateGoalField('holeWidth', e.target.value); }} />
                            </label>
                            <label className={styles.field}>
                                <span>Collector Y</span>
                                <input type="number" value={goalLayout.collectorY} onChange={function (e) { updateGoalField('collectorY', e.target.value); }} />
                            </label>
                            <label className={styles.field}>
                                <span>Floor Y</span>
                                <input type="number" value={goalLayout.floorY} onChange={function (e) { updateGoalField('floorY', e.target.value); }} />
                            </label>
                            <label className={styles.field}>
                                <span>Sensor Center Y</span>
                                <input type="number" value={goalLayout.sensorCenterY} onChange={function (e) { updateGoalField('sensorCenterY', e.target.value); }} />
                            </label>
                            <label className={styles.field}>
                                <span>Sensor Height</span>
                                <input type="number" value={goalLayout.sensorHeight} onChange={function (e) { updateGoalField('sensorHeight', e.target.value); }} />
                            </label>
                        </div>

                        <div className={styles.card}>
                            <div className={styles.rowHeader}>
                                <h3>Deflectors</h3>
                                <button className={styles.addButton} onClick={addDeflector}>Add</button>
                            </div>

                            {deflectors.length === 0 && <p className={styles.emptyText}>장애물이 아직 없습니다.</p>}

                            {deflectors.map(function (deflector, index) {
                                return (
                                    <div key={'deflector-editor-' + index} className={styles.deflectorCard}>
                                        <div className={styles.rowHeader}>
                                            <button
                                                className={selectedDeflectorIndex === index ? styles.pointButtonActive : styles.pointButton}
                                                onClick={function () {
                                                    setSelectedDeflectorIndex(index);
                                                }}
                                            >
                                                Deflector {index + 1}
                                            </button>
                                            <button className={styles.removeButton} onClick={function () { removeDeflector(index); }}>Remove</button>
                                        </div>

                                        <label className={styles.field}>
                                            <span>X</span>
                                            <input type="number" value={deflector.x} onChange={function (e) { updateDeflectorField(index, 'x', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Y</span>
                                            <input type="number" value={deflector.y} onChange={function (e) { updateDeflectorField(index, 'y', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Width</span>
                                            <input type="number" value={deflector.width} onChange={function (e) { updateDeflectorField(index, 'width', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Height</span>
                                            <input type="number" value={deflector.height} onChange={function (e) { updateDeflectorField(index, 'height', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Angle(rad)</span>
                                            <input type="number" step="0.05" value={deflector.angle} onChange={function (e) { updateDeflectorField(index, 'angle', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Bounce</span>
                                            <input type="number" step="0.05" value={deflector.bounce == null ? 0.9 : deflector.bounce} onChange={function (e) { updateDeflectorField(index, 'bounce', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Move Amp</span>
                                            <input type="number" value={deflector.motionAmplitude == null ? 0 : deflector.motionAmplitude} onChange={function (e) { updateDeflectorField(index, 'motionAmplitude', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Move Speed</span>
                                            <input type="number" step="0.1" value={deflector.motionSpeed == null ? 0 : deflector.motionSpeed} onChange={function (e) { updateDeflectorField(index, 'motionSpeed', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Move Phase</span>
                                            <input type="number" step="0.1" value={deflector.motionPhase == null ? 0 : deflector.motionPhase} onChange={function (e) { updateDeflectorField(index, 'motionPhase', e.target.value); }} />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.card}>
                            <div className={styles.rowHeader}>
                                <h3>Pins</h3>
                                <button className={styles.addButton} onClick={addPin}>Add</button>
                            </div>

                            {pins.length === 0 && <p className={styles.emptyText}>핀 배치가 아직 없습니다.</p>}

                            {pins.map(function (pin, index) {
                                return (
                                    <div key={'pin-editor-' + index} className={styles.deflectorCard}>
                                        <div className={styles.rowHeader}>
                                            <button
                                                className={selectedPinIndex === index ? styles.pointButtonActive : styles.pointButton}
                                                onClick={function () {
                                                    setSelectedPinIndex(index);
                                                }}
                                            >
                                                Pin {index + 1}
                                            </button>
                                            <button className={styles.removeButton} onClick={function () { removePin(index); }}>Remove</button>
                                        </div>

                                        <label className={styles.field}>
                                            <span>X</span>
                                            <input type="number" value={pin.x} onChange={function (e) { updatePinField(index, 'x', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Y</span>
                                            <input type="number" value={pin.y} onChange={function (e) { updatePinField(index, 'y', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Radius</span>
                                            <input type="number" value={pin.radius} onChange={function (e) { updatePinField(index, 'radius', e.target.value); }} />
                                        </label>
                                        <label className={styles.field}>
                                            <span>Bounce</span>
                                            <input type="number" step="0.05" value={pin.bounce == null ? 0.96 : pin.bounce} onChange={function (e) { updatePinField(index, 'bounce', e.target.value); }} />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <div className={styles.card}>
                            <h3>JSON</h3>
                            <textarea className={styles.jsonArea} value={layoutJson} readOnly />
                        </div>
                    </section>
                </div>
            </section>
        </Layout>
    );
}

export default RandomLayoutEditorPage;
