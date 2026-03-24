import { useEffect, useMemo, useRef, useState } from 'react';
import {
    createRandomWorld,
    launchAllMenuBallsAtOnce,
    clearAllDynamicBalls,
    destroyRandomWorld,
    syncStandbyBalls,
} from './randomPhysics.js';
import ConfirmDialog from '../../shared/ui/dialog/ConfirmDialog.jsx';
import { BOARD_HEIGHT, BOARD_WIDTH } from './randomLayout.js';
import styles from './RandomPickerBoard.module.css';

const DEFAULT_MENUS = [
    '김치찌개',
    '라면',
    '초밥',
    '샐러드',
    '햄버거',
    '탕수육',
    '파스타',
    '돈까스',
    '비빔밥',
    '마라탕',
];

const MENU_STORAGE_KEY = 'random-pachinko-menus';
const MAX_MENUS = 10;

const BALL_COLORS = [
    { fill: '#f87171', stroke: '#fecaca', text: '#3b0a0a' },
    { fill: '#fb923c', stroke: '#fed7aa', text: '#3d1906' },
    { fill: '#facc15', stroke: '#fde68a', text: '#3a2a05' },
    { fill: '#4ade80', stroke: '#bbf7d0', text: '#082611' },
    { fill: '#2dd4bf', stroke: '#99f6e4', text: '#062a28' },
    { fill: '#38bdf8', stroke: '#bae6fd', text: '#06243a' },
    { fill: '#818cf8', stroke: '#c7d2fe', text: '#121a48' },
    { fill: '#a78bfa', stroke: '#ddd6fe', text: '#241244' },
    { fill: '#f472b6', stroke: '#fbcfe8', text: '#3d1027' },
    { fill: '#94a3b8', stroke: '#e2e8f0', text: '#172033' },
];

function readStoredMenus() {
    if (typeof window === 'undefined') {
        return DEFAULT_MENUS;
    }

    try {
        var raw = window.localStorage.getItem(MENU_STORAGE_KEY);
        if (raw == null) {
            return DEFAULT_MENUS;
        }

        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return DEFAULT_MENUS;
        }

        var cleaned = parsed
            .map(function (item) {
                return typeof item === 'string' ? item.trim() : '';
            })
            .filter(function (item) {
                return item.length > 0;
            })
            .slice(0, MAX_MENUS);

        return cleaned.length > 0 ? cleaned : DEFAULT_MENUS;
    } catch (_error) {
        return DEFAULT_MENUS;
    }
}

function toShortLabel(fullText) {
    if (fullText == null) {
        return '';
    }

    var text = String(fullText);
    if (text.length <= 3) {
        return text;
    }

    return text.slice(0, 3);
}

function buildBallMenus(menuList) {
    var result = [];
    var i = 0;

    while (i < menuList.length) {
        var full = menuList[i];
        result.push({
            id: 'menu-ball-' + i + '-' + full,
            full: full,
            short: toShortLabel(full),
            color: BALL_COLORS[i % BALL_COLORS.length],
        });
        i = i + 1;
    }

    return result;
}

function shuffleArraySimple(arr) {
    var copy = arr.slice();
    var i = copy.length - 1;

    while (i > 0) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
        i = i - 1;
    }

    return copy;
}

function normalizeMenuValue(value) {
    return value.trim();
}

function RandomPickerBoard() {
    var [menuItems, setMenuItems] = useState(readStoredMenus);
    var [draftMenu, setDraftMenu] = useState('');
    var [isRunning, setIsRunning] = useState(false);
    var [winner, setWinner] = useState(null);
    var [rankings, setRankings] = useState([]);
    var [showFanfare, setShowFanfare] = useState(false);
    var [showRankingPanel, setShowRankingPanel] = useState(false);
    var [launchOrder, setLaunchOrder] = useState([]);
    var [boardScale, setBoardScale] = useState(1);
    var [showMenuResetConfirm, setShowMenuResetConfirm] = useState(false);

    var stageRef = useRef(null);
    var boardViewportRef = useRef(null);
    var worldRef = useRef(null);
    var fanfareTimerRef = useRef(null);
    var rankingTimerRef = useRef(null);

    var menuBalls = useMemo(function () {
        return buildBallMenus(menuItems);
    }, [menuItems]);

    function clearUiTimers() {
        if (fanfareTimerRef.current != null) {
            clearTimeout(fanfareTimerRef.current);
            fanfareTimerRef.current = null;
        }

        if (rankingTimerRef.current != null) {
            clearTimeout(rankingTimerRef.current);
            rankingTimerRef.current = null;
        }
    }

    function resetUiState() {
        clearUiTimers();
        setWinner(null);
        setRankings([]);
        setShowFanfare(false);
        setShowRankingPanel(false);
    }

    function addMenuItem(rawValue) {
        var nextValue = normalizeMenuValue(rawValue);

        if (nextValue.length === 0) {
            return;
        }

        setMenuItems(function (current) {
            if (current.length >= MAX_MENUS) {
                window.alert('메뉴는 최대 10개까지만 등록할 수 있습니다.');
                return current;
            }

            if (current.indexOf(nextValue) !== -1) {
                return current;
            }

            return current.concat(nextValue);
        });

        setDraftMenu('');
    }

    function removeMenuItem(target) {
        setMenuItems(function (current) {
            return current.filter(function (item) {
                return item !== target;
            });
        });
    }

    useEffect(function () {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(menuItems));
    }, [menuItems]);

    useEffect(function () {
        setLaunchOrder(menuBalls);
        setIsRunning(false);
        resetUiState();
    }, [menuBalls]);

    useEffect(function () {
        if (stageRef.current == null) {
            return;
        }

        if (menuBalls.length < 2) {
            if (worldRef.current != null) {
                destroyRandomWorld(worldRef.current);
                worldRef.current = null;
            }
            return;
        }

        if (worldRef.current != null) {
            destroyRandomWorld(worldRef.current);
            worldRef.current = null;
        }

        var created = createRandomWorld({
            mountEl: stageRef.current,
            menuBalls: launchOrder,
            width: BOARD_WIDTH,
            height: BOARD_HEIGHT,
            onGoal: function (goalMenu, rank) {
                if (goalMenu == null || rank > 3) {
                    return;
                }

                setRankings(function (current) {
                    if (current.some(function (item) { return item.id === goalMenu.id; })) {
                        return current;
                    }
                    return current.concat(goalMenu).slice(0, 3);
                });

                if (rank === 1) {
                    clearUiTimers();
                    setWinner(goalMenu);
                    setShowFanfare(true);

                    rankingTimerRef.current = setTimeout(function () {
                        setShowRankingPanel(true);
                    }, 220);

                    fanfareTimerRef.current = setTimeout(function () {
                        setShowFanfare(false);
                    }, 1800);
                }
            },
        });

        worldRef.current = created;

        return function () {
            clearUiTimers();

            if (worldRef.current != null) {
                destroyRandomWorld(worldRef.current);
                worldRef.current = null;
            }
        };
    }, [menuBalls.length]);

    useEffect(function () {
        if (worldRef.current == null) {
            return;
        }

        syncStandbyBalls(worldRef.current, launchOrder);
        resetUiState();
    }, [launchOrder]);

    useEffect(function () {
        if (boardViewportRef.current == null) {
            return;
        }

        function updateBoardScale() {
            if (boardViewportRef.current == null) {
                return;
            }

            var availableWidth = boardViewportRef.current.clientWidth - 28;
            if (availableWidth <= 0) {
                return;
            }

            setBoardScale(Math.min(1, availableWidth / BOARD_WIDTH));
        }

        updateBoardScale();

        var observer = new ResizeObserver(function () {
            updateBoardScale();
        });

        observer.observe(boardViewportRef.current);
        window.addEventListener('resize', updateBoardScale);

        return function () {
            observer.disconnect();
            window.removeEventListener('resize', updateBoardScale);
        };
    }, []);

    function handleStart() {
        if (isRunning || worldRef.current == null || launchOrder.length < 2) {
            return;
        }

        resetUiState();
        setIsRunning(true);
        launchAllMenuBallsAtOnce(worldRef.current);
    }

    function handleShuffleLayout() {
        if (isRunning) {
            return;
        }

        setLaunchOrder(function (current) {
            return shuffleArraySimple(current);
        });
    }

    function handleRestart() {
        setIsRunning(false);
        resetUiState();

        if (worldRef.current != null) {
            clearAllDynamicBalls(worldRef.current);
            syncStandbyBalls(worldRef.current, launchOrder);
        }
    }

    function handleMenuReset() {
        setShowMenuResetConfirm(false);
        setDraftMenu('');
        setMenuItems(DEFAULT_MENUS);
    }

    function handleDraftKeyDown(event) {
        if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            addMenuItem(draftMenu);
        }
    }

    return (
        <div className={styles.card}>
            <header className={styles.header}>
                <h2>뭐먹지?</h2>
            </header>

            <div className={styles.grid}>
                <section className={styles.leftPanel}>
                    <div className={styles.inputCard}>
                        <div className={styles.inputHeader}>
                            <span className={styles.label}>메뉴 추가</span>
                            <div className={styles.headerStatus}>
                                <span className={styles.statusPill}>
                                    {menuItems.length >= 2 ? '준비 완료' : '메뉴 2개 이상 필요'}
                                </span>
                                <span className={styles.pill}>{isRunning ? '진행 중' : '대기 중'}</span>
                            </div>
                        </div>

                        <div className={styles.addRow}>
                            <input
                                className={styles.menuInput}
                                value={draftMenu}
                                onChange={function (e) {
                                    setDraftMenu(e.target.value);
                                }}
                                onKeyDown={handleDraftKeyDown}
                                placeholder="메뉴를 입력하고 Enter"
                                disabled={menuItems.length >= MAX_MENUS}
                            />
                            <button
                                className={styles.addButton}
                                onClick={function () {
                                    addMenuItem(draftMenu);
                                }}
                                disabled={menuItems.length >= MAX_MENUS}
                            >
                                추가
                            </button>
                        </div>

                        <div className={styles.badgePanel}>
                            {menuItems.map(function (item) {
                                return (
                                    <button
                                        key={item}
                                        className={styles.menuBadge}
                                        onClick={function () {
                                            if (!isRunning) {
                                                removeMenuItem(item);
                                            }
                                        }}
                                        disabled={isRunning}
                                        title={isRunning ? '진행 중에는 메뉴를 바꿀 수 없습니다.' : '클릭해서 삭제'}
                                    >
                                        <span className={styles.menuBadgeText}>{item}</span>
                                        {!isRunning && <span className={styles.menuBadgeRemove}>×</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.buttonRow}>
                        <button
                            className={styles.primaryButton}
                            onClick={handleStart}
                            disabled={isRunning || menuItems.length < 2}
                        >
                            {isRunning ? '진행 중' : 'Start'}
                        </button>

                        <button
                            className={styles.secondaryButton}
                            onClick={handleShuffleLayout}
                            disabled={isRunning || menuItems.length < 2}
                        >
                            배치 섞기
                        </button>

                        <button
                            className={styles.ghostButton}
                            onClick={handleRestart}
                            disabled={menuItems.length < 2}
                        >
                            다시 시작
                        </button>

                        <button
                            className={styles.menuResetButton}
                            onClick={function () {
                                setShowMenuResetConfirm(true);
                            }}
                            disabled={isRunning}
                        >
                            메뉴 초기화
                        </button>
                    </div>
                </section>

                <section className={styles.boardPanel}>
                    <div ref={boardViewportRef} className={styles.boardViewport}>
                        <div
                            className={styles.boardSurface}
                            style={{ height: BOARD_HEIGHT * boardScale + 'px' }}
                        >
                            {winner != null && (
                                <div className={styles.winnerDock}>
                                    <span className={styles.winnerDockLabel}>WINNER</span>
                                    <strong className={styles.winnerDockValue}>{winner.full}</strong>
                                </div>
                            )}
                            <div
                                className={styles.stageScaler}
                                style={{
                                    width: BOARD_WIDTH + 'px',
                                    height: BOARD_HEIGHT + 'px',
                                    transform: 'translateX(-50%) scale(' + boardScale + ')',
                                }}
                            >
                                <div
                                    ref={stageRef}
                                    className={styles.stage}
                                    style={{ width: BOARD_WIDTH + 'px', height: BOARD_HEIGHT + 'px' }}
                                />
                            </div>
                        </div>
                    </div>

                    {showRankingPanel && (
                        <div className={styles.resultCard}>
                            <div className={styles.rankRow}>
                                <span className={styles.resultTitle}>1위</span>
                                <strong className={styles.resultValue}>{rankings[0] == null ? '-' : rankings[0].full}</strong>
                            </div>
                            <div className={styles.rankRow}>
                                <span className={styles.resultTitle}>2위</span>
                                <strong className={styles.resultSubValue}>{rankings[1] == null ? '-' : rankings[1].full}</strong>
                            </div>
                            <div className={styles.rankRow}>
                                <span className={styles.resultTitle}>3위</span>
                                <strong className={styles.resultSubValue}>{rankings[2] == null ? '-' : rankings[2].full}</strong>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            {showFanfare && winner != null && (
                <div className={styles.fanfareOverlay}>
                    <div className={styles.fanfareBurst} />
                    <div className={styles.fanfareBurstSecondary} />
                    <div className={styles.fanfareGlow} />
                    <div className={styles.fanfareBox}>
                        <div className={styles.fanfareRibbon}>WINNER</div>
                        <div className={styles.fanfareSmall}>1위 확정</div>
                        <div className={styles.fanfareMain}>{winner.full}</div>
                    </div>
                </div>
            )}

            <ConfirmDialog
                open={showMenuResetConfirm}
                title="메뉴 초기화"
                description="현재 저장된 메뉴를 기본 10개 메뉴로 되돌립니다. 계속할까요?"
                confirmText="초기화"
                cancelText="취소"
                onConfirm={handleMenuReset}
                onCancel={function () {
                    setShowMenuResetConfirm(false);
                }}
            />
        </div>
    );
}

export default RandomPickerBoard;
