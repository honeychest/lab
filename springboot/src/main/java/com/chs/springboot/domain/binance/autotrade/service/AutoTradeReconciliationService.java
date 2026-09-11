package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeFuturesAccountSnapshot;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeReconciliation;
import com.chs.springboot.domain.binance.autotrade.model.AutoTradeReconciliationKind;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AutoTradeReconciliationService {

    private final AutoTradeConfigService configService;
    private final AutoTradeFuturesReadOnlyClient futuresClient;

    public AutoTradeReconciliation reconcile() {
        if (!futuresClient.isConfigured()) {
            return new AutoTradeReconciliation(AutoTradeReconciliationKind.NOT_CONFIGURED,
                    null, "선물 API 키가 설정되지 않았습니다");
        }
        try {
            AutoTradeFuturesAccountSnapshot account = futuresClient.snapshot(configService.current().symbol());
            if (account.positions().size() > 1) {
                return new AutoTradeReconciliation(AutoTradeReconciliationKind.UNKNOWN,
                        account, "자동매매가 관리할 수 없는 복수 포지션 상태입니다");
            }
            if (account.positions().isEmpty() && !account.openOrders().isEmpty()) {
                return new AutoTradeReconciliation(AutoTradeReconciliationKind.PENDING_ORDERS,
                        account, "포지션 없이 미체결 주문이 남아 있습니다");
            }
            if (account.positions().isEmpty()) {
                return new AutoTradeReconciliation(AutoTradeReconciliationKind.FLAT,
                        account, "포지션과 미체결 주문이 없습니다");
            }
            return new AutoTradeReconciliation(AutoTradeReconciliationKind.OPEN_POSITION,
                    account, "현재 포지션을 확인했습니다");
        } catch (RuntimeException e) {
            return new AutoTradeReconciliation(AutoTradeReconciliationKind.UNKNOWN,
                    null, "Binance 선물 상태를 확인하지 못했습니다");
        }
    }
}
