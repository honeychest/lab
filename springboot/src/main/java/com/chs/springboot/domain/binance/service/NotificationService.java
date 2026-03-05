// [AGENT] 역할: 외부 알림 발송 인터페이스 (Strategy Pattern) | 연관파일: LogNotificationService.java(구현체), BinanceStreamService.java, UpbitStreamService.java | 주요메서드: sendAlert(String message) | 교체 시 @Primary 어노테이션으로 구현체 전환
// Purpose: 외부 알림 발송 인터페이스 — 텔레그램 등 구현체 교체 가능

/**
 * ─────────────────────────────────────────────────────────────────
 *  인터페이스(Interface)란?
 * ─────────────────────────────────────────────────────────────────
 *  "무엇을 해야 하는가"를 정의하고, "어떻게 하는가"는 구현체에서 결정.
 *
 *  현재 구현체: LogNotificationService (콘솔 로그 출력)
 *  추후 교체 가능: TelegramNotificationService, SlackNotificationService 등
 *
 *  인터페이스의 장점:
 *    BinanceStreamService는 NotificationService 타입으로만 알고,
 *    실제로 어떤 구현체인지 모름.
 *    → 구현체를 바꿔도 BinanceStreamService 코드를 수정할 필요 없음.
 *
 *  jQuery 비유:
 *    $.ajax 내부 구현은 몰라도 $.ajax({url, success, error})로 쓸 수 있듯이,
 *    sendAlert(message)만 호출하면 내부 구현(로그/텔레그램)은 알 필요 없음.
 *
 *  디자인 패턴: Strategy Pattern (전략 패턴)
 *    알림 전송 전략을 런타임에 교체 가능.
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.binance.service;

/**
 * NotificationService 인터페이스.
 * 시스템 오류나 중요 이벤트 발생 시 외부로 알림을 보내는 계약을 정의.
 */
public interface NotificationService {

    /**
     * sendAlert: 알림 메시지를 전송.
     *
     * @param message 전송할 알림 메시지.
     *   예: "[BinanceStream] 오류: Connection refused"
     *
     * 구현체별 동작:
     *   LogNotificationService  → log.warn()으로 콘솔 출력
     *   TelegramNotificationService → 텔레그램 봇 API로 메시지 전송 (미구현)
     *   EmailNotificationService → 이메일 발송 (미구현)
     *
     * 호출 위치:
     *   BinanceStreamService.BinanceListener.onError()
     *   바이낸스 WebSocket 오류 발생 시 알림.
     */
    void sendAlert(String message);
}
