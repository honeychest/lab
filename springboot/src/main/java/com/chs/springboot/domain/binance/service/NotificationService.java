// Purpose: 외부 알림 발송 인터페이스 — 텔레그램 등 구현체 교체 가능
package com.chs.springboot.domain.binance.service;

public interface NotificationService {
    void sendAlert(String message);
}
