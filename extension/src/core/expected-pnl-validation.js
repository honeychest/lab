const DECIMAL = /^\d+(\.\d+)?$/;

export function validateExpectedPnlOrders(orders) {
    if (!Array.isArray(orders) || orders.length > 50) {
        return { ok: false, message: '예상 손익 요청은 최대 50건까지입니다' };
    }
    for (const order of orders) {
        if (!order || typeof order.requestKey !== 'string' || !/^row-\d+$/.test(order.requestKey)) {
            return { ok: false, message: '표 행 식별자 형식이 올바르지 않습니다' };
        }
        if (typeof order.symbol !== 'string' || !/^[A-Z0-9]{4,20}$/.test(order.symbol)) {
            return { ok: false, message: '심볼 형식이 올바르지 않습니다' };
        }
        if (!['BUY', 'SELL'].includes(order.side)
            || !['LONG', 'SHORT', 'BOTH'].includes(order.positionSide)
            || typeof order.reduceOnly !== 'boolean'
            || typeof order.price !== 'string'
            || typeof order.origQty !== 'string'
            || typeof order.executedQty !== 'string'
            || !DECIMAL.test(order.price)
            || !DECIMAL.test(order.origQty)
            || !DECIMAL.test(order.executedQty)) {
            return { ok: false, message: '예상 손익 주문 필드 형식이 올바르지 않습니다' };
        }
    }
    return { ok: true, orders };
}
