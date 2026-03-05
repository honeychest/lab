// [AGENT] 역할: 정적 텔레그램 로그 유틸리티 — 코드 어디서든 TelegramLog.info/error() 호출 가능 | 연관파일: TelegramProvider.java | staticProvider(@PostConstruct 초기화)로 Spring 빈을 정적 컨텍스트에서 사용하는 패턴
package com.chs.springboot.global;

import com.chs.springboot.global.TelegramProvider;
import org.springframework.stereotype.Component;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class TelegramLog {

    private final TelegramProvider telegramProvider;
    private static TelegramProvider staticProvider;

    @PostConstruct
    private void init() {
        staticProvider = telegramProvider;
    }

    // 코드 어디서든 TelegramLog.info("...")로 호출 가능
    public static void info(String message) {
        if (staticProvider != null) {
            staticProvider.sendMessage("[INFO] " + message);
        }
    }

    public static void error(String message) {
        if (staticProvider != null) {
            staticProvider.sendMessage("[🚨ERROR] " + message);
        }
    }
}