// 페이지 세계 보조 스크립트. 확장 API·키·메시지에는 접근하지 않는다.
// data-chs-* 속성은 미체결 주문 표 예상 손익 표시 전용이며 주문 동작 경로에서 읽지 않는다.

(() => {
    const TABLE_SELECTOR = '[data-testid="openOrdersTableInfo"]';
    const ROW_CLASS = 'h-[48px]';
    let scanFrame = null;

    function orderRows(table) {
        return [...table.querySelectorAll('div')].filter((row) => (
            row.classList.contains(ROW_CLASS) && row.children.length === 13
        ));
    }

    function orderPropsOf(row) {
        const key = Object.keys(row).find((name) => name.startsWith('__reactFiber'));
        let fiber = key ? row[key] : null;
        for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
            if (fiber.memoizedProps?.orderProps) return fiber.memoizedProps.orderProps;
        }
        return null;
    }

    function setAttributeIfChanged(row, name, value) {
        if (value === null || value === undefined) {
            if (row.hasAttribute(name)) row.removeAttribute(name);
            return;
        }
        const text = String(value);
        if (row.getAttribute(name) !== text) row.setAttribute(name, text);
    }

    function copyOrderProps(row, orderProps) {
        if (!orderProps) {
            for (const name of [
                'data-chs-symbol',
                'data-chs-side',
                'data-chs-position-side',
                'data-chs-price',
                'data-chs-orig-qty',
                'data-chs-executed-qty',
                'data-chs-reduce-only',
            ]) setAttributeIfChanged(row, name, null);
            return;
        }
        setAttributeIfChanged(row, 'data-chs-symbol', orderProps.symbol);
        setAttributeIfChanged(row, 'data-chs-side', orderProps.side);
        setAttributeIfChanged(row, 'data-chs-position-side', orderProps.positionSide);
        setAttributeIfChanged(row, 'data-chs-price', orderProps.price);
        setAttributeIfChanged(row, 'data-chs-orig-qty', orderProps.origQty);
        setAttributeIfChanged(row, 'data-chs-executed-qty', orderProps.executedQty ?? '0');
        setAttributeIfChanged(row, 'data-chs-reduce-only', Boolean(orderProps.reduceOnly));
    }

    function scan() {
        scanFrame = null;
        const table = document.querySelector(TABLE_SELECTOR);
        if (!table) return;
        for (const row of orderRows(table)) copyOrderProps(row, orderPropsOf(row));
    }

    function scheduleScan() {
        if (scanFrame !== null) return;
        scanFrame = requestAnimationFrame(scan);
    }

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleScan();
})();
