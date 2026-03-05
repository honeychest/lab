// [AGENT] 역할: NotificationService 기본 구현체 (WARN 레벨 로그 출력) | 연관파일: NotificationService.java(인터페이스), BinanceStreamService.java, UpbitStreamService.java | 주요메서드: sendAlert() → log.warn("[ALERT] {}") | 교체 방법: 새 구현체에 @Primary 추가
// Purpose: NotificationService 기본 구현체 — 콘솔 로그로 알림 출력 (추후 텔레그램 등으로 교체)

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할
 * ─────────────────────────────────────────────────────────────────
 *  NotificationService 인터페이스의 가장 단순한 구현체.
 *  실제 외부 알림(텔레그램, 이메일 등) 없이 로그로만 출력.
 *
 *  현재 단계:
 *    개발/테스트 단계이므로 로그 출력으로 충분.
 *    운영 단계로 넘어가면 TelegramNotificationService를 만들고
 *    이 클래스를 비활성화(또는 @Primary 어노테이션으로 교체)하면 됨.
 *
 *  왜 이렇게 분리하나?
 *    BinanceStreamService에서 직접 log.warn() 을 써도 되지만,
 *    나중에 알림 방식을 바꾸려면 BinanceStreamService 코드를 고쳐야 함.
 *    인터페이스로 분리하면 알림 구현만 교체하면 됨 (개방-폐쇄 원칙).
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.binance.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * @Service:
 *   Spring이 이 클래스를 빈으로 등록.
 *   같은 타입의 NotificationService 구현체가 이것 하나뿐이므로
 *   BinanceStreamService에 자동으로 이 구현체가 주입됨.
 *
 *   만약 TelegramNotificationService를 추가할 경우:
 *     @Primary 어노테이션을 새 구현체에 붙이면 자동으로 교체됨.
 *     또는 application.properties에서 @ConditionalOnProperty로 조건부 활성화.
 *
 * implements NotificationService:
 *   NotificationService 인터페이스를 구현.
 *   sendAlert() 메서드를 반드시 구현해야 함.
 */
@Service
public class LogNotificationService implements NotificationService {

    /**
     * Logger: 로그 출력 객체.
     * LogNotificationService 이름으로 생성하므로
     * 로그에 "[LogNotificationService]" 태그가 붙음.
     */
    private static final Logger log = LoggerFactory.getLogger(LogNotificationService.class);

    /**
     * sendAlert: 알림 메시지를 WARN 레벨 로그로 출력.
     *
     * @param message 출력할 알림 메시지
     *
     * log.warn():
     *   WARN 레벨 = 경고. 심각하지 않지만 주의가 필요한 상황.
     *   INFO보다 높고 ERROR보다 낮음.
     *   로그 레벨 순서: TRACE < DEBUG < INFO < WARN < ERROR
     *
     *   왜 ERROR가 아닌 WARN인가?
     *     BinanceStreamService.onError()에서 이미 log.error()로 원인을 기록함.
     *     이 알림 메서드는 별도 알림 채널 역할이므로 WARN으로 구분.
     *
     * [ALERT] 태그:
     *   로그 검색 시 "[ALERT]" 키워드로 알림 메시지만 필터링 가능.
     *   jQuery 비유: console.warn('[ALERT]', message); 와 동일.
     *
     * 향후 텔레그램 구현 시:
     *   @Service
     *   @Primary  ← 이 빈을 우선 사용
     *   public class TelegramNotificationService implements NotificationService {
     *     public void sendAlert(String message) {
     *       telegramBot.send(chatId, message); // 실제 텔레그램 전송
     *     }
     *   }
     */
    @Override
    public void sendAlert(String message) {
        log.warn("[ALERT] {}", message);
    }
}
