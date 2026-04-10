package com.chs.springboot.global;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * DRAFT 로그 래퍼
 * - 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록
 * - 구현 완료 후에도 코드에 유지 (주석 역할 겸용)
 * - 모든 동작 변경은 이 클래스 한 곳에서만 수정
 *
 * 활성화: application-local.properties 에 dlog.enabled=true 추가
 */
@Component
public class chs {

    private static final Logger log = LoggerFactory.getLogger("DRAFT");
    private static boolean enabled = false;

    @Value("${dlog.enabled:false}")
    public void setEnabled(boolean value) {
        chs.enabled = value;
    }

    public static void dlog(String message) {
        if (!enabled) return;
        log.warn("[DRAFT] {}", message);
    }

    // ... 가변인자. 저 자리에 인자를 0~N 개 넣을수 있다는 의미 Object[] args 와 비슷.
    // chs.dlog("주문: {}", new Object[]{orderId, amount}); 하지만 ... 을 쓰면 chs.dlog("주문: {}", orderId, amount);
    public static void dlog(String message, Object... args) {
        if (!enabled) return;
        log.warn("[DRAFT] " + message, args);
    }
}
