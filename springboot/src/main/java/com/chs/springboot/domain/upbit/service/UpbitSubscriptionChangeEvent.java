// Purpose: 업비트 WebSocket 구독 코드 집합 변경을 전달하는 이벤트

package com.chs.springboot.domain.upbit.service;

import org.springframework.context.ApplicationEvent;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 프론트엔드 세션들의 업비트 구독 코드 합집합이 바뀔 때 발행되는 이벤트.
 *
 * 예:
 * - 첫 클라이언트가 KRW-BTC,KRW-USDT로 접속
 * - 두 번째 클라이언트가 KRW-ETH,KRW-USDT로 접속
 * => 이벤트 codes는 [KRW-BTC, KRW-USDT, KRW-ETH]
 *
 * StreamService는 이 이벤트를 수신해 업비트 상위 소켓 구독 대상을
 * 단일 연결에서 한 번에 갱신한다.
 */
public class UpbitSubscriptionChangeEvent extends ApplicationEvent {

    private final Set<String> codes;

    public UpbitSubscriptionChangeEvent(Object source, Set<String> codes) {
        super(source);
        this.codes = Collections.unmodifiableSet(new LinkedHashSet<>(codes));
    }

    public Set<String> getCodes() {
        return codes;
    }
}
