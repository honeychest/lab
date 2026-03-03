package com.chs.springboot.features.contact.controller;

import com.chs.springboot.features.contact.entity.ContactInquiry;
import com.chs.springboot.features.contact.repository.ContactInquiryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 텔레그램 Webhook 수신 컨트롤러.
 *
 * 등록 방법 (배포 후 1회 실행):
 *   curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
 *        -d "url=https://{도메인}/api/telegram/webhook&secret_token={TELEGRAM_WEBHOOK_SECRET}"
 *
 * 관리자(눈생)가 텔레그램에서 문의 메시지에 "답장(Reply)" 기능으로 응답하면,
 * 이 Webhook이 호출되고 reply_to_message 에서 #inquiryId(앞 8자)를 추출하여 DB에 저장한다.
 */
@Slf4j
@RestController
@RequestMapping("/api/telegram")
@RequiredArgsConstructor
public class TelegramWebhookController {

    private static final Pattern ID_PATTERN = Pattern.compile("\\[문의 #([0-9a-f]{8})\\]");

    @Value("${telegram.webhook-secret:}")
    private String webhookSecret;

    private final ContactInquiryRepository inquiryRepository;

    @PostMapping("/webhook")
    public ResponseEntity<Void> receive(
            @RequestHeader(value = "X-Telegram-Bot-Api-Secret-Token", required = false) String secretToken,
            @RequestBody Map<String, Object> payload
    ) {
        // 1. Secret token 검증 (설정된 경우에만 체크)
        if (!webhookSecret.isBlank() && !webhookSecret.equals(secretToken)) {
            log.warn("Telegram webhook: invalid secret token");
            return ResponseEntity.status(403).build();
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> message = (Map<String, Object>) payload.get("message");
            if (message == null) return ResponseEntity.ok().build();

            // 2. Reply 여부 확인 — 새 메시지는 무시
            @SuppressWarnings("unchecked")
            Map<String, Object> replyTo = (Map<String, Object>) message.get("reply_to_message");
            if (replyTo == null) return ResponseEntity.ok().build();

            // 3. 원본 메시지에서 inquiryId(8자) 추출
            String originalText = (String) replyTo.get("text");
            if (originalText == null) return ResponseEntity.ok().build();

            Matcher matcher = ID_PATTERN.matcher(originalText);
            if (!matcher.find()) {
                log.debug("Telegram webhook: reply without inquiryId, ignored");
                return ResponseEntity.ok().build();
            }
            String shortId = matcher.group(1); // 8자 prefix

            // 4. DB에서 해당 문의 조회 후 답변 저장
            Optional<ContactInquiry> opt = inquiryRepository.findAll().stream()
                    .filter(i -> i.getInquiryId().startsWith(shortId))
                    .findFirst();

            if (opt.isEmpty()) {
                log.warn("Telegram webhook: no inquiry found for id prefix={}", shortId);
                return ResponseEntity.ok().build();
            }

            String replyText = (String) message.get("text");
            if (replyText == null || replyText.isBlank()) return ResponseEntity.ok().build();

            ContactInquiry inquiry = opt.get();
            inquiry.setReplyText(replyText);
            inquiry.setRepliedAt(LocalDateTime.now());
            inquiryRepository.save(inquiry);

            log.info("Telegram webhook: reply saved for inquiryId={}", inquiry.getInquiryId());

        } catch (Exception e) {
            log.error("Telegram webhook processing error: {}", e.getMessage());
        }

        return ResponseEntity.ok().build();
    }
}
