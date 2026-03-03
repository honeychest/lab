package com.chs.springboot.features.contact.controller;

import com.chs.springboot.global.TelegramUpdateProcessor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 텔레그램 Webhook 수신 컨트롤러 (telegram.mode=webhook 일 때만 활성화).
 *
 * SSL 설정 후 전환 방법:
 *   1. application.properties: telegram.mode=webhook
 *   2. 서버 재배포
 *   3. curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
 *           -d "url=https://{도메인}/api/telegram/webhook&secret_token={TELEGRAM_WEBHOOK_SECRET}"
 */
@Slf4j
@RestController
@RequestMapping("/api/telegram")
@ConditionalOnProperty(name = "telegram.mode", havingValue = "webhook")
@RequiredArgsConstructor
public class TelegramWebhookController {

    @Value("${telegram.webhook-secret:}")
    private String webhookSecret;

    private final TelegramUpdateProcessor processor;

    @PostMapping("/webhook")
    public ResponseEntity<Void> receive(
            @RequestHeader(value = "X-Telegram-Bot-Api-Secret-Token", required = false) String secretToken,
            @RequestBody Map<String, Object> payload
    ) {
        // Secret token 검증 (설정된 경우에만 체크)
        if (!webhookSecret.isBlank() && !webhookSecret.equals(secretToken)) {
            log.warn("Telegram webhook: invalid secret token");
            return ResponseEntity.status(403).build();
        }

        processor.process(payload);
        return ResponseEntity.ok().build();
    }
}
