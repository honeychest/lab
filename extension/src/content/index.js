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
        // 2단 확인 대기 중인 동작. 'place' | 'cancel' | null
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
        controls: document.createElement('div'),
        table: document.createElement('div'),
        footer: document.createElement('div'),
    };
    root.append(boxes.header, boxes.banner, boxes.controls, boxes.table, boxes.footer);
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

    function symbolFromUrl() {
        const match = location.pathname.match(/\/futures\/([A-Za-z0-9_]+)/);
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
        state.input.anchorPrice = '';
        state.message = '';
        render();
        if (symbol) {
            await fillAnchorPrice();
            refreshAccount();
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
        boxes.controls.hidden = !open;
        boxes.table.hidden = !open;
        boxes.footer.hidden = !open;

        if (open) {
            fill(boxes.controls, controls());
            renderData();
        } else if (!state.collapsed) {
            boxes.table.hidden = false;
            fill(boxes.controls);
            fill(boxes.table, note('선물 거래 화면에서 열어 주세요'));
            fill(boxes.footer);
        }
        applyPosition();
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
        fill(boxes.table, table());
        fill(boxes.footer, footer());
        applyPosition();
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function applyPosition() {
        if (!state.position) {
            root.style.left = '';
            root.style.top = '';
            root.style.right = '';
            return;
        }
        root.style.right = 'auto';
        root.style.left = `${state.position.left}px`;
        root.style.top = `${state.position.top}px`;
        // 펼치면 키가 커진다. 화면 밖으로 밀려나면 보이는 데까지 끌어올린다.
        const rect = root.getBoundingClientRect();
        const top = clamp(state.position.top, 0, Math.max(0, innerHeight - rect.height));
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
                    left: clamp(moveEvent.clientX - offsetX, 0, innerWidth - rect.width),
                    top: clamp(moveEvent.clientY - offsetY, 0, innerHeight - rect.height),
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
        bar.append(toggle);
        return bar;
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
        const modeSelect = el('select', 'mode');
        for (const mode of ['PAPER', 'TEST', 'LIVE']) {
            const option = el('option', null, mode);
            option.value = mode;
            if (state.mode === mode) option.selected = true;
            modeSelect.append(option);
        }
        modeSelect.addEventListener('change', () => {
            state.mode = modeSelect.value;
            savePrefs();
            render();
        });
        sideRow.append(modeSelect);

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

        if (state.message) box.append(el('div', 'message', state.message));
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
        await onSymbolChanged();
    })();
})();
