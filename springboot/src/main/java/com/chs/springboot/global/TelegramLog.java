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