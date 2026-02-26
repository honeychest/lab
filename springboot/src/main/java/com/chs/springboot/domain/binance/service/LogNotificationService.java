// Purpose: NotificationService 기본 구현체 — 콘솔 로그로 알림 출력 (추후 텔레그램 등으로 교체)
package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LogNotificationService implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(LogNotificationService.class);

    @Override
    public void sendAlert(String message) {
        log.warn("[ALERT] {}", message);
    }
}
