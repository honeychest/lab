// 바이낸스 선물 페이지 위에 패널을 띄운다.
//
// 바이낸스 DOM 은 읽지 않는다 — URL 에서 심볼만 가져온다. 그래서 바이낸스가
// 화면 구조를 바꿔도 깨지지 않는다. 패널은 Shadow DOM 안에 두어 바이낸스
// 전역 CSS 와 서로 간섭하지 않게 한다.
//
// 계산과 전송은 전부 background 가 한다. 이 파일은 키를 만지지 않는다.

(() => {
    const HOST_ID = 'chs-scale-order-host';
    if (document.getElementById(HOST_ID)) return;

    const PREFS_KEY = 'panelPrefs';
    const DEBOUNCE_MS = 500;
    const expectedPnlRowKeys = new WeakMap();
    let expectedPnlRowSequence = 0;

    function sameOrderId(a, b) {
        return String(a) === String(b);
    }

    function rowKey(row) {
        let key = expectedPnlRowKeys.get(row);
        if (!key) {
            key = `row-${++expectedPnlRowSequence}`;
            expectedPnlRowKeys.set(row, key);
        }
        return key;
    }

    const state = {
        symbol: null,
        input: {
            side: 'LONG',
            rangePercent: 40,
            levelCount: 9,
            totalNotional: '1000',
            multiplier: '2.0',
            anchorPrice: '',
        },
        mode: 'PAPER',
        tab: 'scale',
        plan: null,
        planId: null,
        digest: null,
        busy: false,
        collapsed: false,
        message: '',
        account: null,
        lastExecution: null,
        // 경계값은 background(core/plan.js)에서 받아 온다. 화면이 따로 갖지 않는다.
        limits: null,
        // 2단 확인 대기 중인 동작. 'place' | 'cancel' | { action: 'chase', order } | null
        // native confirm() 은 크롬이 "추가 대화상자 차단"을 걸면 조용히 false 를
        // 돌려준다. 돈이 나가는 버튼에서 그건 무음 고장이라 패널 안에서 확인받는다.
        confirming: null,
        // 패널 위치. null 이면 CSS 기본 자리(우측 상단). 접은 채로 끌어 옮기면 기억한다.
        position: null,
        // 페이지의 호가를 클릭하면 기준가로 가져올지. 끄면 직접 입력만 받는다.
        pickFromBook: true,
        // 오독 판정용 기준. 클릭해서 읽은 값이 이 근처가 아니면 버린다.
        reference: null,
        // 입력이 바뀌어 표가 아직 최신이 아닌 상태. 표를 지우지 않고 흐리게 둔다.
        stale: false,
        // 키가 없는 상태. 표는 나오지만 전송은 못 한다 — 그걸 화면에 드러낸다.
        needKey: false,
        chaseOrders: [],
        positions: null,
        chaseLoading: false,
        chaseExpandedSymbols: new Set(),
        watches: [],
        watchConnection: {},
        watchSettings: null,
        watchResumePreview: null,
        conditionForm: null,
        settingsOpen: false,
    };

    const host = document.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('src/content/panel.css');
    const root = document.createElement('div');
    root.className = 'panel';
    // 입력칸을 다시 그리면 포커스가 빠진다. 그래서 화면을 영역으로 나누고
    // 데이터가 바뀔 때는 입력 영역(boxes.controls)을 건드리지 않는다.
    const boxes = {
        header: document.createElement('div'),
        banner: document.createElement('div'),
        tabs: document.createElement('div'),
        mode: document.createElement('div'),
        message: document.createElement('div'),
        body: document.createElement('div'),
        controls: document.createElement('div'),
        table: document.createElement('div'),
        footer: document.createElement('div'),
    };
    boxes.body.className = 'panel-body';
    boxes.body.append(boxes.controls, boxes.table);
    root.append(boxes.header, boxes.banner, boxes.tabs, boxes.mode, boxes.message, boxes.body, boxes.footer);
    shadow.append(style, root);
    document.documentElement.append(host);

    function send(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ kind: 'FAILED', message: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response ?? { kind: 'FAILED', message: '응답이 없습니다' });
            });
        });
    }

    let expectedPnlTimer = null;
    let expectedPnlRateTimer = null;
    let expectedPnlSignature = null;
    const expectedPnlRequestTimes = [];

    function expectedPnlTableRows() {
        const table = document.querySelector('[data-testid="openOrdersTableInfo"]');
        if (!table) return [];
        return [...table.querySelectorAll('[data-chs-symbol]')].filter((row) => row.children.length === 13);
    }

    function tableCloseOrder(row) {
        const positionSide = row.dataset.chsPositionSide;
        const side = row.dataset.chsSide;
        return positionSide === 'LONG' && side === 'SELL'
            || positionSide === 'SHORT' && side === 'BUY'
            || positionSide === 'BOTH' && row.dataset.chsReduceOnly === 'true';
    }

    function tablePriceMatches(row, expectedPrice = row.dataset.chsPrice) {
        const price = Number(expectedPrice);
        const text = row.children[4]?.textContent?.match(/-?[\d,]+(?:\.\d+)?/u)?.[0];
        return Number.isFinite(price) && text !== undefined && Number(text.replace(/,/g, '')) === price;
    }

    function expectedPnlOrders() {
        return expectedPnlTableRows()
            .filter((row) => tableCloseOrder(row) && tablePriceMatches(row))
            .map((row) => ({
                requestKey: rowKey(row),
                symbol: row.dataset.chsSymbol,
                positionSide: row.dataset.chsPositionSide,
                side: row.dataset.chsSide,
                reduceOnly: row.dataset.chsReduceOnly === 'true',
                price: row.dataset.chsPrice,
                origQty: row.dataset.chsOrigQty,
                executedQty: row.dataset.chsExecutedQty,
            }));
    }

    function formatTablePnl(value) {
        if (value === null || value === undefined || !/^-?\d+(\.\d+)?$/.test(String(value))) return null;
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        return `${number >= 0 ? '+' : ''}${number.toLocaleString('en-US', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        })}`;
    }

    function applyExpectedPnl(response) {
        const resultByKey = new Map((response?.orders || []).map((item) => [String(item.requestKey), item]));
        const requestedByKey = new Map(expectedPnlOrders().map((order) => [String(order.requestKey), order]));
        for (const row of expectedPnlTableRows()) {
            const cell = row.children[4];
            const key = rowKey(row);
            const result = resultByKey.get(key);
            const requested = requestedByKey.get(key);
            const formatted = formatTablePnl(result?.expectedPnl);
            let span = cell.querySelector(':scope > .chs-pnl');
            const validAtInsert = requested
                && requested.requestKey === key
                && requested.price === row.dataset.chsPrice
                && requested.origQty === row.dataset.chsOrigQty
                && requested.executedQty === row.dataset.chsExecutedQty
                && row.children.length === 13
                && tablePriceMatches(row, result?.price)
                && result?.price === requested.price;
            if (!validAtInsert || !formatted || !result?.entryPrice) {
                span?.remove();
                continue;
            }
            if (!span) {
                span = document.createElement('span');
                span.className = 'chs-pnl';
                cell.append(span);
            }
            span.textContent = formatted;
            const orderDecimals = result.priceDecimals;
            const entryDecimals = Number.isInteger(orderDecimals) ? orderDecimals + 2 : null;
            span.title = `체결 시 예상 손익 ${formatted} USDT (수수료·펀딩 제외), 진입가 ${formatPrice(result.entryPrice, entryDecimals)} → 주문 ${formatPrice(result.price, orderDecimals)}`;
            span.style.display = 'inline-block';
            span.style.marginLeft = '4px';
            span.style.fontSize = '10px';
            span.style.fontWeight = '600';
            span.style.lineHeight = '1';
            span.style.color = Number(result.expectedPnl) >= 0 ? '#0ecb81' : '#f6465d';
        }
    }

    function scheduleExpectedPnl() {
        clearTimeout(expectedPnlTimer);
        if (expectedPnlRateTimer !== null) return;
        expectedPnlTimer = setTimeout(updateExpectedPnl, 300);
    }

    function expectedPnlRateDelay() {
        const now = Date.now();
        while (expectedPnlRequestTimes[0] <= now - 1000) expectedPnlRequestTimes.shift();
        return expectedPnlRequestTimes.length >= 2 ? 1000 - (now - expectedPnlRequestTimes[0]) : 0;
    }

    async function updateExpectedPnl() {
        expectedPnlTimer = null;
        const delay = expectedPnlRateDelay();
        if (delay > 0) {
            expectedPnlRateTimer = setTimeout(() => {
                expectedPnlRateTimer = null;
                scheduleExpectedPnl();
            }, delay);
            return;
        }
        const orders = expectedPnlOrders();
        if (orders.length > 30) orders.length = 30;
        const signature = JSON.stringify(orders);
        if (signature === expectedPnlSignature) return;
        expectedPnlSignature = signature;
        expectedPnlRequestTimes.push(Date.now());
        const response = await send({ kind: 'EXPECTED_PNL', orders });
        if (signature !== JSON.stringify(expectedPnlOrders())) {
            scheduleExpectedPnl();
            return;
        }
        if (response?.kind === 'EXPECTED_PNL') applyExpectedPnl(response);
    }

    function watchExpectedPnlTable() {
        const observer = new MutationObserver(scheduleExpectedPnl);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        scheduleExpectedPnl();
    }

    function symbolFromUrl() {
        if (location.protocol !== 'https:' || location.hostname !== 'www.binance.com') return null;
        const match = location.pathname.match(/^\/(?:[A-Za-z-]+\/)?futures\/([A-Za-z0-9]+)$/);
        if (!match) return null;
        const symbol = match[1].toUpperCase();
        return /^[A-Z0-9]{4,20}$/.test(symbol) ? symbol : null;
    }

    async function loadPrefs() {
        const stored = await chrome.storage.local.get(PREFS_KEY);
        const prefs = stored[PREFS_KEY];
        if (!prefs) return;
        Object.assign(state.input, prefs.input ?? {});
        if (prefs.mode) state.mode = prefs.mode;
        if (prefs.tab === 'scale' || prefs.tab === 'chase') state.tab = prefs.tab;
        if (typeof prefs.collapsed === 'boolean') state.collapsed = prefs.collapsed;
        if (prefs.position) state.position = prefs.position;
        if (typeof prefs.pickFromBook === 'boolean') state.pickFromBook = prefs.pickFromBook;
    }

    function savePrefs() {
        const { anchorPrice, ...rest } = state.input;
        chrome.storage.local.set({
            [PREFS_KEY]: {
                input: rest,
                mode: state.mode,
                tab: state.tab,
                collapsed: state.collapsed,
                position: state.position,
                pickFromBook: state.pickFromBook,
            },
        });
    }

    let confirmTimer = null;
    function askConfirm(action) {
        state.confirming = action;
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(() => {
            state.confirming = null;
            renderData();
        }, 8000);
        renderData();
    }

    function clearConfirm() {
        clearTimeout(confirmTimer);
        state.confirming = null;
    }

    let debounceTimer = null;
    function flushPreview() {
        clearTimeout(debounceTimer);
        refreshPreview();
    }

    function schedulePreview() {
        clearConfirm();
        clearTimeout(debounceTimer);
        // 이전 표를 지우지 않는다. 지우면 한 글자 칠 때마다 화면이 비어 깜빡인다.
        // 대신 흐리게 두고 실행 버튼만 잠근다.
        state.planId = null;
        state.digest = null;
        state.stale = true;
        renderData();
        debounceTimer = setTimeout(refreshPreview, DEBOUNCE_MS);
    }

    async function refreshPreview() {
        if (!state.symbol || !state.input.anchorPrice) return;
        const response = await send({
            kind: 'PREVIEW',
            input: {
                symbol: state.symbol,
                side: state.input.side,
                anchorPrice: String(state.input.anchorPrice).trim(),
                rangePct: Number(state.input.rangePercent) / 100,
                levelCount: Number(state.input.levelCount),
                totalNotional: String(state.input.totalNotional).trim(),
                multiplier: state.input.multiplier,
            },
        });

        state.stale = false;
        if (typeof response.needKey === 'boolean') state.needKey = response.needKey;
        if (response.kind === 'PLAN') {
            state.plan = response;
            state.planId = response.planId;
            state.digest = response.digest;
            state.message = '';
        } else if (response.kind === 'INVALID') {
            state.plan = null;
            state.message = response.reasons.join(' / ');
        } else {
            state.plan = null;
            state.message = response.message ?? '계산에 실패했습니다';
        }
        renderData();
    }

    async function refreshAccount() {
        if (!state.symbol) return;
        const response = await send({ kind: 'ACCOUNT', symbol: state.symbol });
        state.account = response.kind === 'ACCOUNT' ? response : null;
        if (response.kind === 'NEED_KEY') state.needKey = true;
        renderData();
    }

    let chaseRequestGeneration = 0;
    let watchPollTimer = null;
    let chaseView = null;
    let lastConditionPriceInput = null;
    let conditionFormSequence = 0;

    function activeChaseView() {
        return state.tab === 'chase' && !state.collapsed && Boolean(state.symbol);
    }

    function updateWatchPolling() {
        if (activeChaseView()) {
            if (!watchPollTimer) {
                refreshWatchList();
                watchPollTimer = setInterval(refreshWatchList, 2000);
            }
        } else if (watchPollTimer) {
            clearInterval(watchPollTimer);
            watchPollTimer = null;
        }
    }

    async function refreshWatchList({ refresh = false } = {}) {
        if (!activeChaseView()) return;
        const response = await send({ kind: refresh ? 'WATCH_REFRESH' : 'WATCH_LIST' });
        if (!activeChaseView()) return;
        if (response?.watches) {
            state.watches = response.watches.filter((watch) => watch.state !== 'DONE');
            state.watchConnection = response.connection || {};
            if (response.settings) state.watchSettings = response.settings;
            if (chaseView) renderWatchListInto(chaseView.watchBox);
            else renderData();
        } else if (response?.message) {
            state.message = response.message;
            fill(boxes.message, messageArea());
            boxes.message.hidden = boxes.message.childElementCount === 0;
        }
    }

    async function refreshChase({ reset = false } = {}) {
        if (!state.symbol) return;
        const requestGeneration = ++chaseRequestGeneration;
        const requestSymbol = state.symbol;
        const requestTab = state.tab;
        state.chaseExpandedSymbols.clear();
        if (reset) {
            clearConfirm();
            state.message = '';
        }
        state.chaseLoading = true;
        renderData();
        const [response] = await Promise.all([
            send({ kind: 'OPEN_ORDERS_ALL' }),
            refreshWatchList({ refresh: reset }),
        ]);
        if (
            requestGeneration !== chaseRequestGeneration ||
            requestSymbol !== state.symbol ||
            requestTab !== state.tab
        ) {
            return;
        }
        state.chaseLoading = false;
        if (response.kind === 'OPEN_ORDERS') {
            state.chaseOrders = response.orders;
            state.positions = response.positions;
            if (state.conditionForm
                && !state.chaseOrders.some((order) => String(order.orderId) === String(state.conditionForm.orderId))) {
                state.conditionForm = null;
                lastConditionPriceInput = null;
                clearConfirm();
                state.message = '주문이 목록에서 사라졌습니다';
            }
        } else {
            state.chaseOrders = [];
            state.positions = null;
            if (response.kind === 'NEED_KEY') state.needKey = true;
            const message = response.message ?? '미체결 주문을 읽지 못했습니다';
            state.message = state.message ? `${state.message} · ${message}` : message;
        }
        renderData();
    }

    async function loadWatchSettings() {
        const response = await send({ kind: 'WATCH_SETTINGS_GET' });
        if (response.kind === 'WATCH_SETTINGS') state.watchSettings = response.settings;
    }

    async function fillAnchorPrice() {
        const response = await send({ kind: 'PRICE', symbol: state.symbol });
        if (response.kind === 'PRICE') {
            state.reference = { bid: Number(response.bid), ask: Number(response.ask) };
            state.input.anchorPrice = state.input.side === 'LONG' ? response.bid : response.ask;
            syncInput('anchorPrice');
            schedulePreview();
        }
    }

    // 페이지의 호가를 클릭하면 기준가로 가져온다.
    //
    // 바이낸스 DOM 을 읽는 유일한 곳이다. 마크업이 바뀌면 못 읽게 되는데,
    // 그때는 "아무 일도 안 일어남" 이 되어야지 엉뚱한 값이 들어가면 안 된다.
    // 그래서 두 겹으로 거른다 — 수량 표기(45.46K)를 후보에서 빼고,
    // 현재 호가에서 너무 먼 값은 버린다.
    const BOOK_BAND = 0.5;

    function inBand(value) {
        if (!state.reference || !Number.isFinite(value) || value <= 0) return false;
        const low = state.reference.bid * (1 - BOOK_BAND);
        const high = state.reference.ask * (1 + BOOK_BAND);
        return value >= low && value <= high;
    }

    function priceCandidate(text) {
        const trimmed = (text ?? '').trim();
        // 45.46K, 1.30M 은 수량이다. 가격에는 접미사가 붙지 않는다.
        if (!/^-?[\d,]+(\.\d+)?$/.test(trimmed)) return null;
        const value = Number(trimmed.replace(/,/g, ''));
        return inBand(value) ? trimmed.replace(/,/g, '') : null;
    }

    // 클릭한 자리에서 위로 올라가며 "칸이 여럿인 줄" 을 찾고, 그 칸들 중
    // 가격으로 읽히는 첫 값을 쓴다.
    function priceFromClick(target) {
        let node = target;
        for (let depth = 0; node && depth < 6; depth += 1) {
            const cells = [...node.children].filter((child) => (child.textContent ?? '').trim());
            if (cells.length >= 2 && cells.length <= 6) {
                for (const cell of cells) {
                    const price = priceCandidate(cell.textContent);
                    if (price) return price;
                }
            }
            node = node.parentElement;
        }
        return null;
    }

    function watchBookClicks() {
        document.addEventListener(
            'click',
            (event) => {
                if (!state.pickFromBook || !state.symbol || state.busy) return;
                // 우리 패널 안의 클릭은 대상이 아니다.
                const path = event.composedPath ? event.composedPath() : [];
                if (path.includes(host)) return;

                const price = priceFromClick(event.target);
                if (!price) return;
                if (state.tab === 'chase' && state.conditionForm
                    && state.conditionForm.priceElement === lastConditionPriceInput) {
                    state.conditionForm.price = price;
                    lastConditionPriceInput.value = price;
                    state.message = `호가 ${price} 를 조건 가격으로 가져왔습니다`;
                    return;
                }
                state.input.anchorPrice = price;
                state.message = `호가 ${price} 를 기준가로 가져왔습니다`;
                syncInput('anchorPrice');
                schedulePreview();
            },
            true, // 캡처 단계 — 바이낸스가 이벤트를 멈춰도 먼저 본다.
        );
    }

    async function onSymbolChanged() {
        const symbol = symbolFromUrl();
        if (symbol === state.symbol) return;
        state.symbol = symbol;
        state.plan = null;
        state.planId = null;
        state.lastExecution = null;
        state.chaseOrders = [];
        state.positions = null;
        state.chaseExpandedSymbols.clear();
        state.conditionForm = null;
        state.watchResumePreview = null;
        lastConditionPriceInput = null;
        chaseRequestGeneration += 1;
        state.input.anchorPrice = '';
        state.message = '';
        clearConfirm();
        render();
        if (symbol) {
            await fillAnchorPrice();
            if (state.tab === 'chase') refreshChase();
            else refreshAccount();
        }
    }

    async function place() {
        if (!state.planId || state.busy) return;
        if (state.confirming !== 'place') {
            askConfirm('place');
            return;
        }
        clearConfirm();
        state.busy = true;
        state.message = '전송 중입니다';
        renderData();
        const response = await send({
            kind: 'PLACE',
            planId: state.planId,
            digest: state.digest,
            mode: state.mode,
        });
        state.busy = false;
        handleExecutionResponse(response);
        refreshAccount();
    }

    async function resume() {
        if (!state.planId || state.busy) return;
        state.busy = true;
        state.message = '접수 여부를 조회하고 있습니다';
        renderData();
        const response = await send({ kind: 'RESUME', planId: state.planId });
        state.busy = false;
        handleExecutionResponse(response);
        refreshAccount();
    }

    function chase(order) {
        if (state.busy) return;
        const confirming = state.confirming;
        if (confirming?.action !== 'chase' || !sameOrderId(confirming.order.orderId, order.orderId)) {
            clearConfirm();
            askConfirm({ action: 'chase', order });
            return;
        }
        clearConfirm();
        state.busy = true;
        state.message = '주문 수정 중입니다';
        renderData();
        send({
            kind: 'CHASE_ONE',
            symbol: order.symbol,
            orderId: order.orderId,
            expected: order,
            mode: state.mode,
        }).then(async (response) => {
            state.busy = false;
            handleChaseResponse(response, order.priceDecimals);
            await refreshChase();
        });
    }

    function handleChaseResponse(response, priceDecimals = null) {
        switch (response.kind) {
            case 'CHASED':
                state.message = `Chase 완료: ${formatPrice(response.before.price, priceDecimals)} → ${formatPrice(response.after.price, priceDecimals)} (${response.after.status}) · 수정 이력 ${response.traced ? '확인됨' : '미확인'}`;
                break;
            case 'REJECTED':
                state.message = response.message;
                break;
            case 'STALE':
                state.message = `주문이 바뀌었습니다: ${response.diff.join(', ')}`;
                break;
            case 'NOT_SENT':
            case 'FORBIDDEN':
            case 'INVALID':
            case 'RATE_LIMIT':
            case 'BUSY':
            case 'UNKNOWN':
            case 'NEED_KEY':
                state.message = response.message ?? '주문 수정에 실패했습니다';
                if (response.kind === 'NEED_KEY') state.needKey = true;
                break;
            default:
                state.message = response.message ?? '주문 수정에 실패했습니다';
        }
        renderData();
    }

    function handleExecutionResponse(response) {
        if (response.kind === 'PLACED' || response.kind === 'HALTED' || response.kind === 'RECONCILED') {
            state.lastExecution = response;
            const s = response.summary;
            state.message =
                response.kind === 'PLACED'
                    ? `${s.total}건 중 ${s.accepted}건 접수, ${s.rejected}건 거부`
                    : `${response.reason} (접수 ${s.accepted} / 거부 ${s.rejected} / 불명 ${s.unknown} / 남음 ${s.pending})`;
        } else if (response.kind === 'STALE') {
            state.message = response.message;
            schedulePreview();
        } else if (response.kind === 'NEED_KEY') {
            state.needKey = true;
            state.message = '확장 옵션에서 API 키를 먼저 입력하세요';
        } else if (response.kind === 'INVALID') {
            state.message = response.reasons.join(' / ');
        } else {
            state.message = response.message ?? '전송에 실패했습니다';
        }
        renderData();
    }

    async function cancelAll() {
        if (!state.symbol || state.busy) return;
        if (state.confirming !== 'cancel') {
            askConfirm('cancel');
            return;
        }
        clearConfirm();
        state.busy = true;
        renderData();
        const response = await send({ kind: 'CANCEL_ALL', symbol: state.symbol });
        state.busy = false;
        state.message =
            response.kind === 'CANCELLED'
                ? `취소 확인: ${response.before}건에서 ${response.after}건으로`
                : (response.message ?? '취소에 실패했습니다');
        refreshAccount();
    }

    function stepMultiplier(direction) {
        if (!state.limits) return;
        const step = state.limits.multiplierStep;
        const next = Math.round((Number(state.input.multiplier) + direction * step) * 10) / 10;
        if (next < state.limits.multiplierMin || next > state.limits.multiplierMax) return;
        state.input.multiplier = next.toFixed(1);
        savePrefs();
        render();
        schedulePreview();
    }

    function money(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return String(value ?? '');
        return n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    // 입력 요소 참조. 호가 클릭이나 자동 채우기로 값이 바뀔 때
    // 전체를 다시 그리지 않고 그 칸만 갱신하려고 들고 있는다.
    const inputs = {};

    function syncInput(key) {
        if (inputs[key] && document.activeElement !== inputs[key]) {
            inputs[key].value = state.input[key] ?? '';
        }
    }

    function fill(box, ...children) {
        box.innerHTML = '';
        box.append(...children);
    }

    // 전체 다시 그리기. 입력칸도 새로 만들어지므로 포커스가 빠진다.
    // 심볼·모드·접힘처럼 구조가 바뀔 때만 부른다.
    function render() {
        root.classList.toggle('collapsed', state.collapsed);
        const bar = header();
        fill(boxes.header, bar);
        // 이동은 접힌 상태에서만. 펼친 채로 끌면 값을 만지다가 창이 따라 움직인다.
        if (state.collapsed) enableDrag(bar);

        const open = !state.collapsed && Boolean(state.symbol);
        boxes.banner.hidden = state.collapsed;
        boxes.tabs.hidden = !open;
        boxes.mode.hidden = !open;
        boxes.message.hidden = !open;
        boxes.body.hidden = state.collapsed;
        boxes.controls.hidden = !open || state.tab !== 'scale';
        boxes.table.hidden = false;
        boxes.footer.hidden = !open;

        if (open) {
            fill(boxes.tabs, tabBar());
            fill(boxes.mode, modeBar());
            if (state.tab === 'scale') fill(boxes.controls, controls());
            else fill(boxes.controls);
            renderData();
        } else if (!state.collapsed) {
            boxes.tabs.hidden = true;
            boxes.mode.hidden = true;
            boxes.message.hidden = true;
            boxes.body.hidden = false;
            boxes.controls.hidden = true;
            boxes.table.hidden = false;
            fill(boxes.tabs);
            fill(boxes.mode);
            fill(boxes.controls);
            fill(boxes.table, note('선물 거래 화면에서 열어 주세요'));
            fill(boxes.footer);
        }
        applyPosition();
        updateWatchPolling();
    }

    // 값만 다시 그린다. 입력 영역은 그대로 두므로 타이핑 중에도 포커스가 유지된다.
    function renderData() {
        const bar = header();
        fill(boxes.header, bar);
        if (state.collapsed) {
            enableDrag(bar);
            applyPosition();
            return;
        }
        if (state.needKey) fill(boxes.banner, banner());
        else fill(boxes.banner);
        if (!state.symbol) return;
        fill(boxes.message, messageArea());
        if (state.tab === 'scale') {
            fill(boxes.table, table());
            fill(boxes.footer, footer());
            boxes.footer.hidden = false;
        } else {
            fill(boxes.table, chaseTable());
            fill(boxes.footer);
            boxes.footer.hidden = true;
        }
        boxes.message.hidden = boxes.message.childElementCount === 0;
        applyPosition();
        updateWatchPolling();
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function applyPosition() {
        if (!state.position) {
            root.style.left = '';
            root.style.top = '';
            root.style.right = '';
            const rect = root.getBoundingClientRect();
            const top = clamp(rect.top, 0, Math.max(0, innerHeight - rect.height));
            if (top !== rect.top) root.style.top = `${top}px`;
            return;
        }
        root.style.right = 'auto';
        root.style.left = `${state.position.left}px`;
        root.style.top = `${state.position.top}px`;
        // 펼치면 키가 커진다. 화면 밖으로 밀려나면 보이는 데까지 끌어올린다.
        const rect = root.getBoundingClientRect();
        const maxLeft = Math.max(0, innerWidth - rect.width);
        const maxTop = Math.max(0, innerHeight - rect.height);
        const left = clamp(state.position.left, 0, maxLeft);
        const top = clamp(state.position.top, 0, maxTop);
        if (left !== state.position.left) root.style.left = `${left}px`;
        if (top !== state.position.top) root.style.top = `${top}px`;
    }

    function enableDrag(handle) {
        handle.classList.add('draggable');
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || event.target.closest('button')) return;
            event.preventDefault();
            const rect = root.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            handle.setPointerCapture(event.pointerId);

            const move = (moveEvent) => {
                state.position = {
                    left: clamp(moveEvent.clientX - offsetX, 0, Math.max(0, innerWidth - rect.width)),
                    top: clamp(moveEvent.clientY - offsetY, 0, Math.max(0, innerHeight - rect.height)),
                };
                applyPosition();
            };
            const up = () => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', up);
                handle.releasePointerCapture(event.pointerId);
                savePrefs();
            };
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
        });
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function note(text) {
        return el('div', 'note', text);
    }

    // 키가 없으면 표는 나와도 전송은 못 한다. 눌러 봐야 아는 상태로 두지 않는다.
    function banner() {
        const box = el('div', 'banner');
        box.append(el('span', null, 'API 키가 없습니다 — 주문을 보낼 수 없습니다'));
        const open = el('button', 'open-options', '옵션 열기');
        open.addEventListener('click', () => send({ kind: 'OPEN_OPTIONS' }));
        box.append(open);
        return box;
    }

    function header() {
        const bar = el('div', 'header');
        bar.append(el('span', 'symbol', state.symbol ?? '-'));
        const meta = [];
        if (state.plan?.positionMode) meta.push(state.plan.positionMode === 'HEDGE' ? '양방향' : '단방향');
        if (state.plan?.leverage) meta.push(`${state.plan.leverage}x`);
        if (state.account) meta.push(`가용 ${money(state.account.availableBalance)} USDT`);
        bar.append(el('span', 'meta', meta.join(' · ')));

        const toggle = el('button', 'toggle', state.collapsed ? '펼치기' : '접기');
        toggle.addEventListener('click', () => {
            state.collapsed = !state.collapsed;
            savePrefs();
            render();
        });
        if (!state.collapsed && state.symbol && state.tab === 'chase') {
            const refresh = el('button', 'resume', state.chaseLoading ? '읽는 중' : '새로고침');
            refresh.disabled = state.busy || state.chaseLoading;
            refresh.addEventListener('click', () => refreshChase({ reset: true }));
            bar.append(refresh);
        }
        bar.append(toggle);
        return bar;
    }

    function tabBar() {
        const bar = el('div', 'tabs');
        for (const [tab, label] of [['scale', '분할주문'], ['chase', 'Chase']]) {
            const button = el('button', `tab ${state.tab === tab ? 'on' : ''}`, label);
            button.addEventListener('click', () => {
                if (state.tab === tab) return;
                state.tab = tab;
                chaseRequestGeneration += 1;
                state.chaseExpandedSymbols.clear();
                state.conditionForm = null;
                state.watchResumePreview = null;
                lastConditionPriceInput = null;
                clearConfirm();
                state.message = '';
                savePrefs();
                render();
                if (tab === 'chase') refreshChase();
                else refreshAccount();
            });
            bar.append(button);
        }
        return bar;
    }

    function modeBar() {
        const row = el('div', 'mode-row');
        row.append(el('label', null, '모드'));
        const select = el('select', 'mode');
        for (const mode of ['PAPER', 'TEST', 'LIVE']) {
            const option = el('option', null, mode);
            option.value = mode;
            if (state.mode === mode) option.selected = true;
            select.append(option);
        }
        select.addEventListener('change', () => {
            state.mode = select.value;
            savePrefs();
            render();
        });
        row.append(select);
        row.append(el('span', 'hint', state.tab === 'chase' ? 'Chase는 LIVE에서만 전송' : ''));
        return row;
    }

    function controls() {
        const box = el('div', 'controls');

        const sideRow = el('div', 'row');
        for (const side of ['LONG', 'SHORT']) {
            const button = el('button', `side ${state.input.side === side ? 'on' : ''}`, side === 'LONG' ? '롱' : '숏');
            button.addEventListener('click', () => {
                state.input.side = side;
                savePrefs();
                render();
                fillAnchorPrice();
            });
            sideRow.append(button);
        }
        const pick = el('button', `pick ${state.pickFromBook ? 'on' : ''}`, state.pickFromBook ? '호가클릭 켬' : '호가클릭 끔');
        pick.title = '페이지의 호가를 클릭하면 기준가로 가져옵니다';
        pick.addEventListener('click', () => {
            state.pickFromBook = !state.pickFromBook;
            savePrefs();
            render();
        });
        sideRow.append(pick);
        box.append(sideRow);

        box.append(
            field('기준가', 'anchorPrice', (value) => {
                state.input.anchorPrice = value;
                schedulePreview();
            }),
            field('범위 %', 'rangePercent', (value) => {
                state.input.rangePercent = value;
                savePrefs();
                schedulePreview();
            }),
            field('회차', 'levelCount', (value) => {
                state.input.levelCount = value;
                savePrefs();
                schedulePreview();
            }),
            field('총액 USDT', 'totalNotional', (value) => {
                state.input.totalNotional = value;
                savePrefs();
                schedulePreview();
            }),
        );

        const stepper = el('div', 'row stepper');
        stepper.append(el('label', null, '배율'));
        const minus = el('button', 'step', '-');
        minus.addEventListener('click', () => stepMultiplier(-1));
        const plus = el('button', 'step', '+');
        plus.addEventListener('click', () => stepMultiplier(1));
        stepper.append(minus, el('span', 'value', state.input.multiplier), plus);
        const bounds = state.limits
            ? `${state.limits.multiplierMin.toFixed(1)} 균등 · 2.0 마틴게일 · ${state.limits.multiplierMax.toFixed(1)} 하단 집중`
            : '';
        stepper.append(el('span', 'hint', bounds));
        box.append(stepper);
        return box;
    }

    function field(label, key, onInput) {
        const row = el('div', 'row');
        row.append(el('label', null, label));
        const input = el('input');
        input.value = state.input[key] ?? '';
        input.addEventListener('input', () => onInput(input.value));
        // 칸을 벗어나면 기다리지 않고 바로 계산한다.
        input.addEventListener('blur', flushPreview);
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') flushPreview();
        });
        inputs[key] = input;
        row.append(input);
        return row;
    }

    function table() {
        const box = el('div', `table ${state.stale ? 'stale' : ''}`);
        if (!state.plan) {
            box.append(note(state.message || '값을 입력하면 표가 나옵니다'));
            return box;
        }

        const head = el('div', 'tr th');
        const columns = [
            ['회차', ''],
            ['가격', '호가단위에 맞춘 지정가'],
            ['목표', '마틴게일로 배분한 목표 금액 (USDT). 이 열의 합이 총액과 같다'],
            ['수량', '목표금액 / 가격 을 주문단위로 내린 것. 실제 주문 수량'],
            ['실제', '수량 x 가격. 실제로 나가는 금액. 내림 때문에 목표보다 작거나 같다'],
            ['비고', '전송에서 빠지는 사유'],
        ];
        for (const [label, hint] of columns) {
            const cell = el('span', null, label);
            if (hint) cell.title = hint;
            head.append(cell);
        }
        box.append(head);

        const executed = new Map((state.lastExecution?.levels ?? []).map((l) => [l.seq, l]));
        for (const level of state.plan.levels) {
            const row = el('div', `tr ${level.skipReason ? 'skip' : ''}`);
            row.append(el('span', null, String(level.seq)));
            row.append(el('span', null, level.price));
            row.append(el('span', null, money(level.targetNotional)));
            row.append(el('span', null, level.quantity));
            row.append(el('span', null, level.skipReason ? '-' : money(level.actualNotional)));
            const executedLevel = executed.get(level.seq);
            row.append(el('span', 'reason', level.skipReason ?? (executedLevel ? executedLevel.status : '')));
            box.append(row);
        }

        const totals = state.plan.totals;
        box.append(
            el(
                'div',
                'totals',
                `목표 ${money(totals.targetNotional)} · 실제 ${money(totals.actualNotional)} · ` +
                    `평균단가 ${totals.averagePrice} · 전송 ${totals.sendCount}건 제외 ${totals.skipCount}건`,
            ),
        );

        // 필요 증거금 = 실제 명목금액 / 레버리지.
        const margin = state.plan.margin;
        if (margin && margin.kind !== 'UNKNOWN') {
            const leverage = state.plan.leverage ? `${state.plan.leverage}x` : '';
            box.append(
                el(
                    'div',
                    margin.kind === 'INSUFFICIENT' ? 'margin short' : 'margin',
                    `필요 증거금 ${money(margin.required)} ${leverage} · 가용 ${money(margin.available)} USDT` +
                        (margin.kind === 'INSUFFICIENT' ? ` — ${money(margin.shortfall)} 모자람` : ''),
                ),
            );
        }
        for (const warning of state.plan.warnings ?? []) box.append(el('div', 'warn', warning));
        return box;
    }

    function chaseDirection(order) {
        if (order.positionSide === 'LONG') {
            if (order.side === 'BUY') return 'Open Long';
            if (order.side === 'SELL') return 'Close Long';
            return null;
        }
        if (order.positionSide === 'SHORT') {
            if (order.side === 'SELL') return 'Open Short';
            if (order.side === 'BUY') return 'Close Short';
            return null;
        }
        if (order.positionSide === 'BOTH') {
            if (order.side === 'BUY') return order.reduceOnly === true ? 'Buy (Close)' : 'Buy';
            if (order.side === 'SELL') return order.reduceOnly === true ? 'Sell (Close)' : 'Sell';
            return null;
        }
        return null;
    }

    function chaseDirectionClass(order) {
        if (!chaseDirection(order)) return '';
        if (order.side === 'BUY') return 'buy';
        if (order.side === 'SELL') return 'sell';
        return '';
    }

    function chaseVisible(order) {
        return order.type === 'LIMIT' && ['NEW', 'PARTIALLY_FILLED'].includes(order.status);
    }

    function chaseEnabled(order) {
        return order.symbol === state.symbol && chaseVisible(order) && Boolean(chaseDirection(order));
    }

    function chaseReason(order) {
        if (order.symbol !== state.symbol) return '이 심볼 화면에서만 수정 가능';
        if (order.type !== 'LIMIT') return 'LIMIT 주문만 수정 가능';
        if (!['NEW', 'PARTIALLY_FILLED'].includes(order.status)) return '미체결 주문만 수정 가능';
        if (!chaseDirection(order)) return 'Unknown';
        return '';
    }

    function isCloseOrder(order) {
        if (order.positionSide === 'LONG') return order.side === 'SELL';
        if (order.positionSide === 'SHORT') return order.side === 'BUY';
        return order.positionSide === 'BOTH' && order.reduceOnly === true;
    }

    function watchedOrder(order) {
        return state.watches.find((watch) => ['ARMED', 'TRIGGERED', 'CHASING'].includes(watch.state)
            && String(watch.orderId) === String(order.orderId));
    }

    function validNumber(value, { positive = false } = {}) {
        const text = String(value ?? '').trim();
        if (!/^-?\d+(\.\d+)?$/.test(text)) return false;
        const number = Number(text);
        return Number.isFinite(number) && (!positive || number > 0);
    }

    function conditionSignature(order, form) {
        return JSON.stringify([
            order.orderId,
            String(form.price ?? '').trim(),
            form.ref,
            String(form.pnl ?? '').trim(),
        ]);
    }

    function conditionTriggers(form) {
        const triggers = {};
        const price = String(form.price ?? '').trim();
        const pnl = String(form.pnl ?? '').trim();
        if (price) triggers.price = { ref: form.ref, target: price };
        if (pnl) triggers.pnl = { target: pnl };
        return triggers;
    }

    function conditionValid(order, form) {
        const price = String(form.price ?? '').trim();
        const pnl = String(form.pnl ?? '').trim();
        if (!price && !pnl) return false;
        if (price && (!validNumber(price, { positive: true }) || !['LAST', 'MARK'].includes(form.ref))) return false;
        if (pnl && (!isCloseOrder(order) || !validNumber(pnl))) return false;
        return true;
    }

    function conditionSummary(order, form) {
        const parts = [];
        const price = String(form.price ?? '').trim();
        const pnl = String(form.pnl ?? '').trim();
        if (price) parts.push(`${form.ref} ${form.ref === 'LAST' ? '가격' : '마크'} ${price}`);
        if (pnl) parts.push(`손익 ${pnl} USDT (LAST 기준)`);
        return parts.join(' 또는 ') || '조건 없음';
    }

    function watchConditionSummary(watch) {
        const parts = [];
        const price = watch.triggers?.price;
        const pnl = watch.triggers?.pnl;
        if (price) parts.push(`${price.ref} ${price.dir === 'UP' ? '≥' : '≤'} ${price.target}`);
        if (pnl) parts.push(`손익 ${pnl.dir === 'UP' ? '≥' : '≤'} ${pnl.target}`);
        return parts.join(' 또는 ');
    }

    function watchStateText(watch) {
        if (watch.state === 'ARMED') return '대기';
        if (watch.state === 'TRIGGERED') return '발동';
        if (watch.state === 'CHASING') return `추격 중(${watch.modifyCount || 0}회)`;
        if (watch.state === 'PAUSED') return `멈춤(${watch.reason || '사유 없음'})`;
        if (watch.state === 'DISARMED') return `해제(${watch.reason || '사유 없음'})`;
        return watch.state;
    }

    const resumeFieldLabels = {
        orderId: '주문 ID',
        symbol: '심볼',
        side: '주문 방향',
        positionSide: '포지션 방향',
        type: '주문 유형',
        timeInForce: '유효 시간',
        reduceOnly: '감소 전용',
        price: '가격',
        origQty: '주문 수량',
        executedQty: '체결 수량',
        status: '주문 상태',
        'position.entryPrice': '포지션 진입가',
        'position.direction': '포지션 방향',
        'position.sizeAbs': '포지션 수량',
    };

    function resumePreviewText(item) {
        if (item.error) return `오류: ${item.error}`;
        const changed = item.unchanged
            ? '그대로'
            : `바뀐 필드: ${(item.changes || []).map((field) => resumeFieldLabels[field] || field).join(', ') || '확인 불가'}`;
        const notes = [];
        if (item.firesImmediately) notes.push('현재 조건 발동 가능');
        if (item.reachedDuringGap) {
            const reached = (item.reachedConditions || []).map((condition) => ({ price: '가격 조건', pnl: '손익 조건' }[condition] || condition));
            notes.push(`공백 중 도달${reached.length ? `(${reached.join(', ')})` : ''}`);
        }
        return [changed, ...notes].join(' · ');
    }

    function openCondition(order) {
        if (watchedOrder(order)) return;
        const same = sameOrderId(state.conditionForm?.order.orderId, order.orderId);
        state.conditionForm = same ? null : {
            formId: ++conditionFormSequence,
            orderId: String(order.orderId),
            order: { ...order },
            price: '',
            ref: 'LAST',
            pnl: '',
        };
        lastConditionPriceInput = null;
        clearConfirm();
        renderData();
    }

    function currentConditionForm(form, orderId) {
        return state.conditionForm === form
            && String(form.formId) === String(state.conditionForm.formId)
            && String(form.orderId) === String(orderId);
    }

    async function tickerValue(ref, order) {
        const response = await send({ kind: 'TICKER', symbol: state.symbol });
        if (response.kind !== 'TICKER') throw new Error(response.message || '현재가를 읽지 못했습니다');
        const value = ref === 'MARK' ? response.mark : response.last;
        if (!validNumber(String(value), { positive: true })) throw new Error('현재가가 올바르지 않습니다');
        return formatPrice(String(value), conditionPriceDecimals(order));
    }

    function conditionPriceDecimals(order) {
        if (Number.isInteger(order?.priceDecimals)) return order.priceDecimals;
        const fraction = String(order?.price ?? '').split('.')[1] || '';
        return fraction.replace(/0+$/, '').length;
    }

    function conditionPriceDelta(order, price) {
        if (!validNumber(String(price ?? ''), { positive: true })
            || !validNumber(String(order?.price ?? ''), { positive: true })) return '';
        const input = Number(price);
        const orderPrice = Number(order.price);
        const percent = (input / orderPrice - 1) * 100;
        return `주문가 대비 ${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
    }

    function updateConditionInput() {
        if (!state.conditionForm) return;
        if (state.conditionForm.priceElement === lastConditionPriceInput) {
            lastConditionPriceInput.value = state.conditionForm.price;
        }
        if (state.conditionForm.priceDeltaElement) {
            const delta = conditionPriceDelta(state.conditionForm.order, state.conditionForm.price);
            state.conditionForm.priceDeltaElement.textContent = delta;
            state.conditionForm.priceDeltaElement.hidden = !delta;
        }
        if (state.conditionForm.statusElement) {
            state.conditionForm.statusElement.textContent = conditionSummary(state.conditionForm.order, state.conditionForm);
        }
        if (state.conditionForm.armButton) {
            state.conditionForm.armButton.disabled = !conditionValid(state.conditionForm.order, state.conditionForm) || state.busy;
        }
    }

    async function fillConditionPrice() {
        const form = state.conditionForm;
        if (!form) return;
        const orderId = form.orderId;
        try {
            const price = await tickerValue(form.ref, form.order);
            if (!currentConditionForm(form, orderId)) return;
            form.price = price;
            updateConditionInput();
        } catch (error) {
            if (!currentConditionForm(form, orderId)) return;
            state.message = error.message;
            renderData();
        }
    }

    async function adjustConditionPrice(percent) {
        const form = state.conditionForm;
        if (!form) return;
        const orderId = form.orderId;
        try {
            if (!String(form.price).trim()) {
                const price = await tickerValue(form.ref, form.order);
                if (!currentConditionForm(form, orderId)) return;
                form.price = price;
            }
            const value = Number(form.price) * (1 + percent);
            const decimals = conditionPriceDecimals(form.order);
            form.price = value.toFixed(decimals);
            updateConditionInput();
        } catch (error) {
            if (!currentConditionForm(form, orderId)) return;
            state.message = error.message;
            renderData();
        }
    }

    async function armCondition(order) {
        const form = state.conditionForm;
        if (!form || !sameOrderId(form.orderId, order.orderId) || !conditionValid(order, form) || state.busy) return;
        const snapshot = form.order;
        const signature = conditionSignature(snapshot, form);
        if (state.confirming?.action !== 'watch-arm'
            || !sameOrderId(state.confirming.orderId, order.orderId)
            || state.confirming.signature !== signature) {
            askConfirm({ action: 'watch-arm', orderId: String(order.orderId), signature });
            state.message = `조건 감시: ${conditionSummary(order, form)}`;
            renderData();
            return;
        }
        clearConfirm();
        state.busy = true;
        state.message = '조건 감시를 켜는 중입니다';
        renderData();
        const response = await send({
            kind: 'WATCH_ARM',
            symbol: order.symbol,
            orderId: String(order.orderId),
            expected: snapshot,
            triggers: conditionTriggers(form),
            mode: state.mode,
        });
        state.busy = false;
        if (response.kind === 'ARMED') {
            state.conditionForm = null;
            state.message = '조건 감시를 켰습니다';
        } else {
            state.message = response.reason || response.message || '조건 감시를 켜지 못했습니다';
        }
        await refreshWatchList();
        renderData();
    }

    function futuresUrl(symbol) {
        if (!/^[A-Z0-9]{4,20}$/.test(symbol)) return null;
        const language = location.pathname.match(/^\/([A-Za-z-]+)\/futures\//)?.[1];
        return `${language ? `/${language}` : ''}/futures/${symbol}`;
    }

    function moveToSymbol(symbol) {
        const url = futuresUrl(symbol);
        if (url) location.assign(url);
    }

    function trimFractionZeros(value) {
        const [intPart, fraction = ''] = value.split('.');
        const trimmed = fraction.replace(/0+$/, '');
        return trimmed ? `${intPart}.${trimmed}` : intPart;
    }

    function validDecimal(value) {
        return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value);
    }

    function formatPrice(price, decimals) {
        if (!validDecimal(price)) return price;
        if (!Number.isInteger(decimals) || decimals < 0) return trimFractionZeros(price);

        const sign = price.startsWith('-') ? '-' : '';
        const [intPart, fraction = ''] = price.slice(sign.length).split('.');
        if (fraction.length <= decimals) {
            return `${sign}${trimFractionZeros(decimals === 0 ? intPart : `${intPart}.${fraction}`)}`;
        }
        const kept = fraction.slice(0, decimals).padEnd(decimals, '0');
        const rounded = BigInt(`${intPart}${kept || '0'}`) + (fraction[decimals] >= '5' ? 1n : 0n);
        const text = rounded.toString().padStart(decimals + 1, '0');
        if (decimals === 0) return `${sign}${text}`;
        return `${sign}${trimFractionZeros(`${text.slice(0, -decimals)}.${text.slice(-decimals)}`)}`;
    }

    function formatQuantity(qty) {
        if (!validDecimal(qty)) return qty;
        const sign = qty.startsWith('-') ? '-' : '';
        const body = trimFractionZeros(qty.slice(sign.length));
        const [intPart, fraction] = body.split('.');
        const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return `${sign}${grouped}${fraction === undefined ? '' : `.${fraction}`}`;
    }

    function positionForOrder(order) {
        return Array.isArray(state.positions)
            ? state.positions.find((position) => position.symbol === order.symbol
                && position.positionSide === order.positionSide)
            : null;
    }

    function formatExpectedPnl(value) {
        if (!validDecimal(String(value ?? ''))) return null;
        const number = Number(value);
        if (!Number.isFinite(number)) return null;
        return `${number >= 0 ? '+' : ''}${number.toLocaleString('en-US', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        })}`;
    }

    function expectedPnlText(order) {
        const formatted = formatExpectedPnl(order?.expectedPnl);
        const position = positionForOrder(order);
        if (formatted === null || !position) return null;
        const orderDecimals = order.priceDecimals;
        const entryDecimals = Number.isInteger(orderDecimals) ? orderDecimals + 2 : null;
        return `체결 시 예상 손익 ${formatted} USDT (진입 ${formatPrice(position.entryPrice, entryDecimals)} → 주문 ${formatPrice(order.price, orderDecimals)}) · 수수료·펀딩 제외`;
    }

    function expectedPnlLine(order) {
        const formatted = formatExpectedPnl(order?.expectedPnl);
        const position = positionForOrder(order);
        if (formatted === null || !position) return null;
        const line = el('div', `confirm-detail expected-pnl ${Number(order.expectedPnl) >= 0 ? 'profit' : 'loss'}`);
        const orderDecimals = order.priceDecimals;
        const entryDecimals = Number.isInteger(orderDecimals) ? orderDecimals + 2 : null;
        line.textContent = `예상 손익 ${formatted} USDT (진입 ${formatPrice(position.entryPrice, entryDecimals)} → 주문 ${formatPrice(order.price, orderDecimals)}) · 수수료·펀딩 제외`;
        return line;
    }

    function chaseSymbolLabel(symbol, symbols) {
        const short = symbol.replace(/(?:USDT|USDC|BUSD|FDUSD)$/, '');
        if (!short || symbols.filter((candidate) => candidate !== symbol && candidate.replace(/(?:USDT|USDC|BUSD|FDUSD)$/, '') === short).length) {
            return symbol;
        }
        return short;
    }

    function chaseRow(order, { current = false, symbols = [] } = {}) {
        const direction = chaseDirection(order) ?? 'Unknown';
        const symbolLabel = chaseSymbolLabel(order.symbol, symbols);
        const executed = Number(order.executedQty);
        const quantity = `${formatQuantity(order.origQty)}${executed > 0 ? ` (체결 ${formatQuantity(order.executedQty)})` : ''}`;
        const row = el('div', 'chase-tr');
        const symbol = el('span', 'chase-symbol', symbolLabel);
        symbol.title = order.symbol;
        const priceElement = el('span', 'chase-price', formatPrice(order.price, order.priceDecimals));
        const pnlTitle = expectedPnlText(order);
        if (pnlTitle) priceElement.title = pnlTitle;
        row.append(
            symbol,
            el('span', 'chase-quantity', quantity),
            el('span', `chase-direction ${chaseDirectionClass(order)}`, direction),
            priceElement,
        );
        if (current) {
            const enabled = chaseEnabled(order);
            const action = el('span', 'chase-action');
            const armed = state.confirming?.action === 'chase' && sameOrderId(state.confirming.order.orderId, order.orderId);
            const button = el('button', `chase-button ${armed ? 'armed' : ''}`, armed ? '정말 Chase' : 'Chase');
            button.disabled = state.busy || !enabled;
            button.title = enabled ? `주문 ID ${order.orderId}` : chaseReason(order);
            button.addEventListener('click', () => chase(order));
            action.append(button);
            const watch = watchedOrder(order);
            if (watch) {
                action.append(el('span', 'watching', '감시 중'));
            } else {
                const condition = el('button', 'condition-button', sameOrderId(state.conditionForm?.order.orderId, order.orderId) ? '닫기' : '조건');
                condition.disabled = !enabled || state.busy;
                condition.title = enabled ? '조건 감시를 설정합니다' : chaseReason(order);
                condition.addEventListener('click', () => openCondition(order));
                action.append(condition);
            }
            row.append(action);
        } else {
            const action = el('span', 'chase-action');
            const button = el('button', 'chase-button', 'Chase');
            button.disabled = true;
            button.title = chaseReason(order);
            action.append(button);
            row.append(action);
        }
        const block = el('div', 'chase-order-block');
        block.append(row);
        if (current && sameOrderId(state.conditionForm?.order.orderId, order.orderId) && !watchedOrder(order)) {
            block.append(conditionForm(order));
        }
        return block;
    }

    function conditionForm(order) {
        const form = state.conditionForm;
        const box = el('div', 'condition-form');
        const priceRow = el('div', 'condition-price-row');
        const priceTools = el('div', 'condition-price-tools');
        priceTools.append(el('span', 'condition-label', '가격'));
        const price = el('input', 'condition-input');
        price.type = 'text';
        price.inputMode = 'decimal';
        price.value = form.price;
        price.placeholder = '가격 조건 선택';
        price.addEventListener('focus', () => {
            if (state.conditionForm === form) lastConditionPriceInput = price;
        });
        price.addEventListener('input', () => {
            if (state.conditionForm !== form) return;
            form.price = price.value;
            state.confirming = state.confirming?.action === 'watch-arm' ? null : state.confirming;
            updateConditionInput();
        });
        form.priceElement = price;
        lastConditionPriceInput = price;
        const now = el('button', 'condition-small-button', '현재가');
        now.addEventListener('click', fillConditionPrice);
        const ref = document.createElement('select');
        ref.className = 'condition-ref';
        for (const name of ['LAST', 'MARK']) {
            const option = el('option', null, name);
            option.value = name;
            option.selected = form.ref === name;
            ref.append(option);
        }
        ref.addEventListener('change', () => {
            if (state.conditionForm !== form) return;
            form.ref = ref.value;
            if (!form.price) fillConditionPrice();
            updateConditionInput();
        });
        priceTools.append(now, ref);
        priceRow.append(priceTools, price);
        box.append(priceRow);
        const delta = el('span', 'condition-price-delta');
        delta.hidden = true;
        form.priceDeltaElement = delta;
        box.append(delta);
        const percentRow = el('div', 'condition-percent-row');
        for (const [label, percent] of [['-1%', -0.01], ['-0.5%', -0.005], ['-0.1%', -0.001], ['+0.1%', 0.001], ['+0.5%', 0.005], ['+1%', 0.01]]) {
            const button = el('button', 'condition-small-button', label);
            button.addEventListener('click', () => adjustConditionPrice(percent));
            percentRow.append(button);
        }
        box.append(percentRow);

        if (isCloseOrder(order)) {
            const pnlRow = el('div', 'condition-row');
            pnlRow.append(el('span', 'condition-label', '손익'));
            const pnl = el('input', 'condition-input');
            pnl.type = 'text';
            pnl.inputMode = 'decimal';
            pnl.value = form.pnl;
            pnl.placeholder = 'USDT (음수 손실, 양수 이익)';
            pnl.addEventListener('input', () => {
                if (state.conditionForm !== form) return;
                form.pnl = pnl.value;
                state.confirming = state.confirming?.action === 'watch-arm' ? null : state.confirming;
                updateConditionInput();
            });
            pnlRow.append(pnl, el('span', 'condition-hint', 'LAST 기준 · 수수료 제외'));
            box.append(pnlRow);
        }

        const actions = el('div', 'condition-actions');
        const arm = el('button', `condition-arm ${state.confirming?.action === 'watch-arm' && sameOrderId(state.confirming.orderId, order.orderId) ? 'armed' : ''}`, state.confirming?.action === 'watch-arm' && sameOrderId(state.confirming.orderId, order.orderId) ? '정말 켜기' : '켜기');
        arm.disabled = !conditionValid(order, form) || state.busy;
        form.armButton = arm;
        arm.addEventListener('click', () => armCondition(order));
        const close = el('button', 'condition-close', '닫기');
        close.addEventListener('click', () => {
            state.conditionForm = null;
            lastConditionPriceInput = null;
            clearConfirm();
            renderData();
        });
        const status = el('div', 'condition-status', conditionSummary(order, form));
        form.statusElement = status;
        box.append(status);
        actions.append(arm, close);
        box.append(actions);
        updateConditionInput();
        return box;
    }

    function connectionStatus() {
        const active = state.watches.some((watch) => ['ARMED', 'TRIGGERED', 'CHASING'].includes(watch.state));
        if (!active) return ['대기', 'idle'];
        const states = Object.values(state.watchConnection).map((value) => value?.state || value);
        if (states.some((value) => value === 'DOWN')) return ['끊김', 'down'];
        if (states.some((value) => value === 'REST_FALLBACK' || value === 'RECONCILING')) return ['조회 감시', 'fallback'];
        if (states.some((value) => value === 'LIVE')) return ['실시간', 'live'];
        return ['대기', 'idle'];
    }

    function watchAction(watch, action, label) {
        const button = el('button', 'watch-action-button', label);
        button.disabled = state.busy;
        button.addEventListener('click', () => {
            if (action === 'disarm') return disarmWatch(watch.id);
            return resumeWatch(watch.id);
        });
        return button;
    }

    async function disarmWatch(id) {
        if (state.confirming?.action !== 'watch-disarm' || state.confirming.id !== id) {
            askConfirm({ action: 'watch-disarm', id });
            state.message = '감시를 해제하려면 한 번 더 누르세요';
            renderData();
            return;
        }
        clearConfirm();
        state.busy = true;
        const response = await send({ kind: 'WATCH_DISARM', id });
        state.busy = false;
        state.message = response.kind === 'DISARMED' ? '감시를 해제했습니다' : (response.message || '감시 해제에 실패했습니다');
        await refreshWatchList();
        renderData();
    }

    async function resumeWatch(ids) {
        const same = state.confirming?.action === 'watch-resume'
            && JSON.stringify(state.confirming.ids) === JSON.stringify(ids);
        if (!same) {
            const response = await send({ kind: 'WATCH_RESUME_PREVIEW', ids });
            state.watchResumePreview = response.kind === 'RESUME_PREVIEW' ? response.previews : null;
            state.message = response.message || '재개 전 상태를 확인하세요';
            askConfirm({ action: 'watch-resume', ids });
            renderData();
            return;
        }
        clearConfirm();
        state.busy = true;
        const response = await send({ kind: 'WATCH_RESUME', ids });
        state.busy = false;
        state.watchResumePreview = null;
        state.message = response.kind === 'CANCELLED' ? response.reason : '감시 재개 결과를 반영했습니다';
        await refreshWatchList();
        renderData();
    }

    async function stopAllWatches() {
        if (state.confirming?.action !== 'watch-stop-all') {
            askConfirm({ action: 'watch-stop-all' });
            state.message = '활성 감시를 모두 멈추려면 한 번 더 누르세요';
            renderData();
            return;
        }
        clearConfirm();
        state.busy = true;
        const response = await send({ kind: 'WATCH_STOP_ALL' });
        state.busy = false;
        state.message = response.message || '활성 감시를 모두 멈췄습니다';
        await refreshWatchList();
        renderData();
    }

    function renderWatchListInto(box) {
        if (!box) return;
        fill(box);
        const paused = state.watches.filter((watch) => watch.state === 'PAUSED');
        const active = state.watches.some((watch) => ['ARMED', 'TRIGGERED', 'CHASING'].includes(watch.state));
        const [connection, connectionClass] = connectionStatus();
        const head = el('div', 'watch-head');
        head.append(el('strong', null, `감시 중 ${state.watches.length}`));
        head.append(el('span', `watch-connection ${connectionClass}`, `● ${connection}`));
        if (paused.length) {
            const resume = el('button', 'watch-action-button', state.confirming?.action === 'watch-resume' ? '정말 모두 재개' : '모두 재개');
            resume.disabled = state.busy;
            resume.addEventListener('click', () => resumeWatch('all'));
            head.append(resume);
        }
        if (active) {
            const stop = el('button', `watch-action-button ${state.confirming?.action === 'watch-stop-all' ? 'armed' : ''}`, state.confirming?.action === 'watch-stop-all' ? '정말 전체 정지' : '전체 정지');
            stop.disabled = state.busy;
            stop.addEventListener('click', stopAllWatches);
            head.append(stop);
        }
        box.append(head);
        if (!state.watches.length) {
            box.append(note('조건 감시 중인 주문이 없습니다'));
            return;
        }
        const table = el('div', 'watch-table');
        const columns = el('div', 'watch-row watch-header');
        for (const label of ['심볼', '수량', '구분', '가격', '조건 요약', '상태', '']) columns.append(el('span', null, label));
        table.append(columns);
        for (const watch of state.watches) {
            const row = el('div', 'watch-row');
            const direction = chaseDirection(watch.known || watch);
            row.append(
                el('span', 'watch-symbol', chaseSymbolLabel(watch.symbol, [watch.symbol])),
                el('span', 'watch-quantity', formatQuantity(watch.known?.origQty ?? '')),
                el('span', `chase-direction ${direction?.includes('Long') || direction === 'Buy' ? 'buy' : 'sell'}`, direction || `${watch.side}`),
                el('span', 'watch-price', formatPrice(watch.known?.price ?? '', null)),
                el('span', 'watch-condition', watchConditionSummary(watch)),
                el('span', 'watch-state', watchStateText(watch)),
            );
            const actions = el('span', 'watch-actions');
            if (['ARMED', 'TRIGGERED', 'CHASING'].includes(watch.state)) actions.append(watchAction(watch, 'disarm', state.confirming?.action === 'watch-disarm' && state.confirming.id === watch.id ? '정말 해제' : '해제'));
            if (watch.state === 'PAUSED') actions.append(watchAction(watch, 'resume', state.confirming?.action === 'watch-resume' && state.confirming.ids === watch.id ? '정말 재개' : '재개'), watchAction(watch, 'disarm', '해제'));
            row.append(actions);
            table.append(row);
        }
        box.append(table);
        if (state.watchResumePreview) {
            const preview = el('div', 'resume-preview');
            for (const item of state.watchResumePreview) {
                preview.append(el('div', null, `${item.symbol || item.id}: ${resumePreviewText(item)}`));
            }
            box.append(preview);
        }
    }

    function settingsBox() {
        const box = el('div', 'watch-settings');
        const toggle = el('button', 'settings-toggle', `설정 ${state.settingsOpen ? 'v' : '>'}`);
        toggle.addEventListener('click', async () => {
            state.settingsOpen = !state.settingsOpen;
            if (state.settingsOpen && !state.watchSettings) await loadWatchSettings();
            renderData();
        });
        box.append(toggle);
        if (!state.settingsOpen) return box;
        const settings = state.watchSettings || {};
        const fields = [
            ['minIntervalMs', '수정 최소 간격(ms)', 200],
            ['maxPerMinute', '분당 최대 수정', 1],
            ['restIntervalMs', '조회 감시 간격(ms)', 1000],
            ['gapMs', '공백 기준(ms)', 15000],
        ];
        const inputs = {};
        for (const [key, label, min] of fields) {
            const row = el('div', 'settings-row');
            row.append(el('label', null, label));
            const input = el('input', 'settings-input');
            input.type = 'number';
            input.min = String(min);
            input.step = '1';
            input.value = settings[key] ?? '';
            inputs[key] = input;
            row.append(input, el('span', 'condition-hint', `최소 ${min}`));
            box.append(row);
        }
        const save = el('button', 'condition-arm', '저장');
        save.addEventListener('click', async () => {
            const next = {};
            for (const [key, label, min] of fields) {
                const value = Number(inputs[key].value);
                if (!Number.isInteger(value) || value < min) {
                    state.message = `${label}: ${min} 이상의 양의 정수만 입력하세요`;
                    renderData();
                    return;
                }
                next[key] = value;
            }
            const response = await send({ kind: 'WATCH_SETTINGS_SET', settings: next });
            const invalid = response.kind === 'INVALID'
                ? response
                : response.settings?.kind === 'INVALID' ? response.settings : null;
            if (!invalid && response.kind === 'WATCH_SETTINGS') state.watchSettings = response.settings;
            state.message = invalid?.reason || (response.kind === 'WATCH_SETTINGS' ? '감시 설정을 저장했습니다' : (response.message || '감시 설정을 저장하지 못했습니다'));
            renderData();
        });
        box.append(save);
        return box;
    }

    function chaseHeader() {
        const row = el('div', 'chase-tr chase-th');
        row.append(
            el('span', 'chase-symbol', '심볼'),
            el('span', 'chase-quantity', '수량'),
            el('span', 'chase-direction', '구분'),
            el('span', 'chase-price', '가격'),
            el('span', 'chase-action', ''),
        );
        return row;
    }

    function chaseTable() {
        const box = el('div', 'table chase-table');
        const watchBox = el('div', 'watch-list');
        renderWatchListInto(watchBox);
        box.append(watchBox);
        if (state.chaseLoading) {
            box.append(note('미체결 주문을 읽는 중입니다'));
            chaseView = { root: box, watchBox };
            return box;
        }

        const orderBox = el('div', 'chase-orders');
        const orders = state.chaseOrders.filter(chaseVisible);
        const symbols = [...new Set(orders.map((order) => order.symbol))];
        const currentOrders = orders
            .filter((order) => order.symbol === state.symbol)
            .sort((a, b) => String(a.orderId).localeCompare(String(b.orderId)));
        if (!currentOrders.length) {
            orderBox.append(note(`이 심볼(${state.symbol})에는 Chase할 주문이 없습니다`));
            if (orders.some((order) => order.symbol !== state.symbol)) {
                orderBox.append(note('다른 심볼 주문은 그 심볼 화면에서 Chase할 수 있습니다'));
            }
        }

        const grouped = new Map();
        for (const order of orders) {
            if (order.symbol === state.symbol) continue;
            if (!grouped.has(order.symbol)) grouped.set(order.symbol, []);
            grouped.get(order.symbol).push(order);
        }
        const hasExpandedOrders = [...grouped.entries()].some(([symbol]) => state.chaseExpandedSymbols.has(symbol));
        if (currentOrders.length || hasExpandedOrders) orderBox.append(chaseHeader());
        for (const order of currentOrders) orderBox.append(chaseRow(order, { current: true, symbols }));
        for (const [symbol, symbolOrders] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            symbolOrders.sort((a, b) => String(a.orderId).localeCompare(String(b.orderId)));
            const expanded = state.chaseExpandedSymbols.has(symbol);
            const group = el('div', 'chase-group');
            const toggle = el('button', 'chase-group-toggle');
            toggle.append(
                el('span', null, `다른 심볼 ${symbol} ${symbolOrders.length}건 ${expanded ? 'v' : '>'}`),
                el('span', 'chase-hint', ' · 그 심볼 화면에서 Chase'),
            );
            toggle.addEventListener('click', () => {
                if (expanded) state.chaseExpandedSymbols.delete(symbol);
                else state.chaseExpandedSymbols.add(symbol);
                renderData();
            });
            const move = el('button', 'chase-move', '이동');
            move.disabled = !futuresUrl(symbol);
            move.addEventListener('click', () => moveToSymbol(symbol));
            group.append(toggle, move);
            orderBox.append(group);
            if (expanded) for (const order of symbolOrders) orderBox.append(chaseRow(order, { symbols }));
        }
        box.append(orderBox, settingsBox());
        chaseView = { root: box, watchBox, orderBox };
        return box;
    }

    function messageArea() {
        const box = el('div', 'message-area');
        if (state.message) box.append(el('div', 'message', state.message));
        const confirming = state.confirming?.action === 'chase' ? state.confirming.order : null;
        if (confirming) {
            const direction = chaseDirection(confirming) ?? 'Unknown';
            const symbols = [...new Set(state.chaseOrders.filter(chaseVisible).map((order) => order.symbol))];
            const symbolLabel = chaseSymbolLabel(confirming.symbol, symbols);
            const detail = el('div', 'confirm-detail');
            detail.append(
                el('span', null, `주문 ID ${confirming.orderId} · ${symbolLabel} · 수량 ${formatQuantity(confirming.origQty)} · `),
                el('span', `chase-direction ${chaseDirectionClass(confirming)}`, direction),
                el(
                    'span',
                    null,
                    ` · 가격 ${formatPrice(confirming.price, confirming.priceDecimals)} · 감소전용 ${confirming.reduceOnly === true ? '예' : '아니오'}`,
                ),
            );
            box.append(detail);
            const pnl = expectedPnlLine(confirming);
            if (pnl) box.append(pnl);
            if (confirming.reduceOnly !== true) box.append(el('div', 'warn', '체결되면 포지션이 늘어납니다'));
            const back = el('button', 'back', '되돌리기');
            back.addEventListener('click', () => {
                clearConfirm();
                renderData();
            });
            box.append(back);
        }
        const watchConfirm = state.confirming;
        if (watchConfirm?.action === 'watch-arm' && state.conditionForm) {
            box.append(el('div', 'confirm-detail', `조건 감시 확인: ${conditionSummary(state.conditionForm.order, state.conditionForm)}`));
            const pnl = expectedPnlLine(state.conditionForm.order);
            if (pnl) box.append(pnl);
        }
        if (watchConfirm?.action === 'watch-disarm') box.append(el('div', 'confirm-detail', '이 감시를 해제하려면 목록의 해제 버튼을 한 번 더 누르세요'));
        if (watchConfirm?.action === 'watch-stop-all') box.append(el('div', 'confirm-detail', '활성 감시를 모두 멈추려면 전체 정지 버튼을 한 번 더 누르세요'));
        if (watchConfirm?.action === 'watch-resume' && state.watchResumePreview) {
            box.append(el('div', 'confirm-detail', '재개 미리보기'));
            for (const item of state.watchResumePreview) {
                box.append(el('div', 'resume-preview-line', `${item.symbol || item.id}: ${resumePreviewText(item)}`));
            }
        }
        return box;
    }

    function footer() {
        const box = el('div', 'footer');
        const sendCount = state.plan?.totals?.sendCount ?? 0;

        const runLabel =
            state.confirming === 'place'
                ? `정말 실행 — ${state.mode} · ${state.symbol} ${state.input.side} ${sendCount}건`
                : `${sendCount}건 주문 실행`;
        const button = el('button', `run ${state.mode === 'LIVE' ? 'live' : ''} ${state.confirming === 'place' ? 'armed' : ''}`, runLabel);
        const unknown = state.lastExecution?.summary?.unknown ?? 0;
        const shortMargin = state.plan?.margin?.kind === 'INSUFFICIENT';
        button.disabled =
            state.busy || state.needKey || !state.planId || sendCount === 0 || unknown > 0 || shortMargin;
        button.addEventListener('click', place);
        box.append(button);

        if (unknown > 0 || (state.lastExecution?.summary?.pending ?? 0) > 0) {
            const resumeButton = el('button', 'resume', '조회 후 이어서 보내기');
            resumeButton.disabled = state.busy;
            resumeButton.addEventListener('click', resume);
            box.append(resumeButton);
        }

        const cancelLabel =
            state.confirming === 'cancel'
                ? `정말 취소 — 직접 건 주문도 사라집니다`
                : `${state.symbol} 미체결 전체 취소`;
        const cancelButton = el('button', `cancel ${state.confirming === 'cancel' ? 'armed' : ''}`, cancelLabel);
        cancelButton.disabled = state.busy;
        cancelButton.addEventListener('click', cancelAll);
        box.append(cancelButton);

        if (state.confirming) {
            const back = el('button', 'back', '되돌리기');
            back.addEventListener('click', () => {
                clearConfirm();
                render();
            });
            box.append(back);
        }

        if (state.account) {
            box.append(el('div', 'open', `미체결 ${state.account.openOrders.length}건`));
        }
        return box;
    }

    // 바이낸스는 SPA 라 페이지 이동 없이 URL 만 바뀐다. 심볼이 바뀌면
    // 이전 미리보기와 전송 상태를 버려야 다른 심볼에 주문이 나가지 않는다.
    function watchUrl() {
        let last = location.href;
        const check = () => {
            if (location.href !== last) {
                last = location.href;
                onSymbolChanged();
            }
        };
        for (const name of ['pushState', 'replaceState']) {
            const original = history[name];
            history[name] = function patched(...args) {
                const result = original.apply(this, args);
                setTimeout(check, 0);
                return result;
            };
        }
        addEventListener('popstate', check);
        addEventListener('hashchange', check);
        setInterval(check, 1000);
    }

    (async () => {
        await loadPrefs();
        const limits = await send({ kind: 'LIMITS' });
        if (limits.kind === 'LIMITS') state.limits = limits;
        const key = await send({ kind: 'KEY_STATUS' });
        state.needKey = key.kind !== 'READY';
        render();
        watchUrl();
        watchBookClicks();
        watchExpectedPnlTable();
        await onSymbolChanged();
    })();
})();
