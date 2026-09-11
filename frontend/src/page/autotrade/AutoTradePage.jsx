import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/shared/ui/layout/Layout.jsx';
import { useAdminAuth } from '@/shared/auth/useAdminAuth.js';
import { shouldRedirectToAdminLogin } from '../admin/adminAccessPolicy.js';
import styles from './AutoTradePage.module.css';
import './AutoTradePage.css';
import '../../styles/themes/monitor-teal.css';
import AutoTradeConsole from './components/AutoTradeConsole.jsx';
import {
    getAutoTradeConfig,
    getAutoTradeExecution,
    getAutoTradeReconciliation,
    getAutoTradeStatus,
    getAutoTradeSymbols,
    patchAutoTradeConfig,
    patchAutoTradeExecution,
    postAutoTradeResetUnknownOrder,
    postAutoTradeRunOnce,
} from './api/autoTradeApi.js';
import {
    fixedRequestError,
    formatModeValue,
    toBackendExecution,
    toBackendStrategyConfig,
    toConfigDraft,
} from './model/autoTradeDisplay.js';
import { useNavigate, useLocation } from 'react-router-dom';

const AUTO_TRADE_FLOATING_WINDOW = Object.freeze({
    width: 1080,
    height: 860,
});

function copyStylesToWindow(targetWindow) {
    const targetDocument = targetWindow.document;
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        targetDocument.head.appendChild(node.cloneNode(true));
    });
    targetDocument.body.className = 'autotradePipBody';
    targetDocument.title = 'AutoTrade Control';
}

function toDraft(value) {
    return Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key, formatModeValue(item)]));
}

function errorMessage(error, fallback) {
    if (error?.response?.status === 403) return '관리자 권한이 필요합니다.';
    if (error?.response?.status === 503) return '자동매매 실행 서버가 응답하지 않습니다.';
    if (error?.response?.status === 409) {
        return error.response.data?.message || '포지션 또는 미체결 주문이 있어 심볼을 변경할 수 없습니다.';
    }
    return fixedRequestError(fallback);
}

export default function AutoTradePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { canAccess, isForbidden } = useAdminAuth();
    const [config, setConfig] = useState(null);
    const [execution, setExecution] = useState(null);
    const [status, setStatus] = useState(null);
    const [reconciliation, setReconciliation] = useState(null);
    const [symbolOptions, setSymbolOptions] = useState([]);
    const [draftConfig, setDraftConfig] = useState({});
    const [draftExecution, setDraftExecution] = useState({});
    const [symbolApplying, setSymbolApplying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dangerAction, setDangerAction] = useState(null);
    const [pipWindow, setPipWindow] = useState(null);
    const [popupOpen, setPopupOpen] = useState(false);
    const popupWindowRef = useRef(null);
    const isPopupWindow = useMemo(
        () => new URLSearchParams(location.search).get('autotradeWindow') === 'popup',
        [location.search]
    );
    const floatingSupported = !isPopupWindow
        && typeof window !== 'undefined'
        && Boolean(window.documentPictureInPicture?.requestWindow);

    const loadAll = useCallback(async ({ quiet = false, preserveConfigDraft = false } = {}) => {
        if (!quiet) setLoading(true);
        try {
            const [nextConfig, nextExecution, nextStatus, nextReconciliation] = await Promise.all([
                getAutoTradeConfig(),
                getAutoTradeExecution(),
                getAutoTradeStatus(),
                getAutoTradeReconciliation(),
            ]);
            setConfig(nextConfig);
            setExecution(nextExecution);
            setStatus(nextStatus);
            setReconciliation(nextReconciliation);
            const nextConfigDraft = toConfigDraft(nextConfig);
            if (preserveConfigDraft) {
                setDraftConfig((current) => ({ ...current, symbol: nextConfigDraft.symbol }));
            } else {
                setDraftConfig(nextConfigDraft);
            }
            setDraftExecution(toDraft(nextExecution));
            try {
                const symbolCatalog = await getAutoTradeSymbols();
                setSymbolOptions(symbolCatalog?.symbols || []);
            } catch {
                setSymbolOptions(nextConfig?.symbol ? [nextConfig.symbol] : []);
            }
            setError('');
        } catch (requestError) {
            setError(errorMessage(requestError, '자동매매 상태를 불러오지 못했습니다.'));
        } finally {
            if (!quiet) setLoading(false);
        }
    }, []);

    const refreshStatus = useCallback(async () => {
        try {
            const [nextStatus, nextReconciliation] = await Promise.all([
                getAutoTradeStatus(),
                getAutoTradeReconciliation(),
            ]);
            setStatus(nextStatus);
            setReconciliation(nextReconciliation);
        } catch (requestError) {
            setError(errorMessage(requestError, '자동매매 상태를 갱신하지 못했습니다.'));
        }
    }, []);

    useEffect(() => {
        if (shouldRedirectToAdminLogin({ canAccess, isForbidden })) {
            navigate('/admin/login', { replace: true, state: { from: location.pathname } });
        }
    }, [canAccess, isForbidden, navigate, location.pathname]);

    useEffect(() => {
        if (canAccess) loadAll();
    }, [canAccess, loadAll]);

    useEffect(() => {
        if (!canAccess) return undefined;
        const intervalId = window.setInterval(refreshStatus, 5000);
        return () => window.clearInterval(intervalId);
    }, [canAccess, refreshStatus]);

    useEffect(() => {
        if (!pipWindow) return undefined;
        const handlePageHide = () => setPipWindow(null);
        pipWindow.addEventListener('pagehide', handlePageHide);
        return () => pipWindow.removeEventListener('pagehide', handlePageHide);
    }, [pipWindow]);

    useEffect(() => {
        if (!popupOpen) return undefined;
        const intervalId = window.setInterval(() => {
            if (popupWindowRef.current?.closed) {
                popupWindowRef.current = null;
                setPopupOpen(false);
                setNotice('분리 창을 닫았습니다.');
            }
        }, 1000);
        return () => window.clearInterval(intervalId);
    }, [popupOpen]);

    const openFloatingWindow = useCallback(async () => {
        if (isPopupWindow) return;
        setError('');
        try {
            if (floatingSupported) {
                const nextWindow = await window.documentPictureInPicture.requestWindow(AUTO_TRADE_FLOATING_WINDOW);
                copyStylesToWindow(nextWindow);
                setPipWindow(nextWindow);
                setNotice('자동매매 화면을 항상 위 창으로 분리했습니다.');
                return;
            }
            const nextWindow = window.open(
                `${window.location.origin}/autotrade?autotradeWindow=popup`,
                'autotrade-control',
                `popup,resizable=yes,width=${AUTO_TRADE_FLOATING_WINDOW.width},height=${AUTO_TRADE_FLOATING_WINDOW.height}`
            );
            if (!nextWindow) {
                setError('브라우저가 새 창을 차단했습니다. 팝업 허용 후 다시 시도해 주세요.');
                return;
            }
            popupWindowRef.current = nextWindow;
            setPopupOpen(true);
            nextWindow.focus();
            setNotice('자동매매 화면을 별도 창으로 열었습니다.');
        } catch {
            setError('항상 위 창을 열지 못했습니다. 브라우저 지원 여부를 확인해 주세요.');
        }
    }, [floatingSupported, isPopupWindow]);

    const closeFloatingWindow = useCallback(() => {
        if (isPopupWindow) {
            window.close();
            return;
        }
        if (pipWindow && !pipWindow.closed) pipWindow.close();
        if (popupWindowRef.current && !popupWindowRef.current.closed) popupWindowRef.current.close();
        setPipWindow(null);
        popupWindowRef.current = null;
        setPopupOpen(false);
        setNotice('기본 화면으로 돌아왔습니다.');
    }, [isPopupWindow, pipWindow]);

    const handleToggleAlwaysOnTop = useCallback((checked) => {
        if (checked) openFloatingWindow();
        else closeFloatingWindow();
    }, [closeFloatingWindow, openFloatingWindow]);

    const updateConfigDraft = (key, value) => setDraftConfig((current) => ({ ...current, [key]: value }));
    const updateExecutionDraft = (key, value) => setDraftExecution((current) => ({ ...current, [key]: value }));

    const applySymbol = async (symbol) => {
        const currentSymbol = config?.symbol;
        if (!symbol || symbol === currentSymbol) {
            updateConfigDraft('symbol', symbol);
            return;
        }
        if (reconciliation?.kind !== 'FLAT') {
            setError('포지션 또는 미체결 주문이 있어 심볼을 변경할 수 없습니다.');
            updateConfigDraft('symbol', currentSymbol || symbol);
            return;
        }
        setSymbolApplying(true);
        setError('');
        updateConfigDraft('symbol', symbol);
        try {
            await patchAutoTradeConfig({ symbol });
            setNotice(`${symbol} 심볼을 적용했습니다. 새 가격 수신을 기다립니다.`);
            await loadAll({ quiet: true, preserveConfigDraft: true });
        } catch (requestError) {
            setError(errorMessage(requestError, '심볼을 적용하지 못했습니다.'));
            updateConfigDraft('symbol', currentSymbol || symbol);
        } finally {
            setSymbolApplying(false);
        }
    };

    const saveConfig = async () => {
        try {
            await patchAutoTradeConfig(toBackendStrategyConfig(draftConfig));
            setNotice('전략 설정을 저장했습니다.');
            await loadAll({ quiet: true });
        } catch (requestError) {
            setError(errorMessage(requestError, '전략 설정을 저장하지 못했습니다.'));
        }
    };

    const saveExecution = async () => {
        if (draftExecution.mode === 'LIVE' && execution?.mode !== 'LIVE') {
            setDangerAction('save');
            return;
        }
        try {
            await patchAutoTradeExecution(toBackendExecution(draftExecution));
            setNotice('실행 설정을 저장했습니다.');
            await loadAll({ quiet: true });
        } catch (requestError) {
            setError(errorMessage(requestError, '실행 설정을 저장하지 못했습니다.'));
        }
    };

    const confirmDanger = async () => {
        const action = dangerAction;
        setDangerAction(null);
        if (action === 'run') {
            await runOnce(true);
            return;
        }
        try {
            await patchAutoTradeExecution(toBackendExecution(draftExecution));
            setNotice('실거래 모드 설정을 저장했습니다. 서버 안전 설정을 확인하세요.');
            await loadAll({ quiet: true });
        } catch (requestError) {
            setError(errorMessage(requestError, '실행 설정을 저장하지 못했습니다.'));
        }
    };

    const runOnce = async (confirmed = false) => {
        if ((status?.mode || execution?.mode) === 'LIVE' && !confirmed) {
            setDangerAction('run');
            return;
        }
        try {
            await postAutoTradeRunOnce();
            setNotice('1회 실행 요청을 보냈습니다.');
            await refreshStatus();
        } catch (requestError) {
            setError(errorMessage(requestError, '1회 실행 요청을 처리하지 못했습니다.'));
        }
    };

    const resetUnknown = async () => {
        try {
            await postAutoTradeResetUnknownOrder();
            setNotice('확인 불가 주문 차단을 해제했습니다.');
            await refreshStatus();
        } catch (requestError) {
            setError(errorMessage(requestError, '주문 차단을 해제하지 못했습니다.'));
        }
    };

    const consoleElement = (
            <AutoTradeConsole
            config={config}
            execution={execution}
            status={status}
            reconciliation={reconciliation}
            symbolOptions={symbolOptions}
            draftConfig={draftConfig}
                draftExecution={draftExecution}
                symbolApplying={symbolApplying}
            loading={loading}
            error={error}
            notice={notice}
            dangerAction={dangerAction}
            isDetached={Boolean(pipWindow || popupOpen || isPopupWindow)}
            floatingSupported={floatingSupported}
                onConfigChange={updateConfigDraft}
                onSymbolChange={applySymbol}
            onExecutionChange={updateExecutionDraft}
            onSaveConfig={saveConfig}
            onSaveExecution={saveExecution}
            onRunOnce={runOnce}
            onResetUnknown={resetUnknown}
            onConfirmDanger={confirmDanger}
            onCancelDanger={() => setDangerAction(null)}
            onRefresh={() => loadAll()}
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        />
    );

    if (isPopupWindow && (canAccess === null || !canAccess)) {
        return <div className={`${styles.page} ${styles.detachedPage}`}><div className={styles.accessState}>{canAccess === null ? '접근 권한 확인 중...' : '로그인 페이지로 이동 중...'}</div></div>;
    }

    if (isPopupWindow) {
        return <div className={`${styles.page} ${styles.detachedPage}`}>{consoleElement}</div>;
    }

    if (canAccess === null || !canAccess) {
        return (
            <Layout footerCenter={['AutoTrade', 'Admin']} enableSupport={false}>
                <div className={styles.accessState}>{canAccess === null ? '접근 권한 확인 중...' : '로그인 페이지로 이동 중...'}</div>
            </Layout>
        );
    }

    return (
        <Layout footerCenter={['AutoTrade', 'PAPER', 'TEST', 'LIVE']} enableSupport={false}>
            <div className={styles.page}>
                {pipWindow || popupOpen ? (
                    <div className={styles.detachedState}>
                        <div className={styles.detachedKicker}>AUTO TRADE CONTROL</div>
                        <strong>화면이 항상 위 창으로 분리되어 있습니다.</strong>
                        <button type="button" className={styles.returnButton} onClick={closeFloatingWindow}>기본 화면으로 돌아오기</button>
                    </div>
                ) : consoleElement}
                {pipWindow && createPortal(consoleElement, pipWindow.document.body)}
            </div>
        </Layout>
    );
}
