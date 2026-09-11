package com.chs.springboot.domain.binance.autotrade.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AutoTradeChatClientConfig {

    static final String SYSTEM_PROMPT = """
            너는 사용자가 선택한 심볼의 바이낸스 USDⓈ-M 선물 자동매매 진입 판단 보조자다.
            제공된 5분봉·15분봉·4시간봉·일봉 시장 데이터만 근거로 최초 진입 방향을 판단하라.
            심볼은 사용자 메시지의 선택 심볼을 기준으로 판단하라.
            이미 포지션이 없을 때만 호출되며, 주문 수량·익절가·손절가를 계산하지 마라.
            응답은 반드시 JSON 하나만 반환하라.
            형식: {"side":"LONG|SHORT|NONE","reason":"짧은 근거"}
            확신이 부족하거나 데이터 상태가 READY가 아니면 side를 NONE으로 반환하라.
            수익 보장, 투자 권유, 주문 실행을 말하지 마라.
            """;

    @Bean(name = "autoTradeChatClient")
    public ChatClient autoTradeChatClient(ChatClient.Builder builder) {
        return builder.defaultSystem(SYSTEM_PROMPT).build();
    }
}
