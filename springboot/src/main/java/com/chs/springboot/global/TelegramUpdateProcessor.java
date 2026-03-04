// [AGENT] 텔레그램 update(메시지) 처리 공통 로직.
// 역할: 관리자 답장 수신 → reply_to_message.text 또는 caption에서 inquiryId 추출
//       → 복수 답장은 [HH:mm] 타임스탬프 구분자로 이어붙이기 → readAt 초기화
// 연관: TelegramPollingService.java, TelegramWebhookController.java, ContactInquiry.java
package com.chs.springboot.global;

import com.chs.springboot.features.contact.entity.ContactInquiry;
import com.chs.springboot.features.contact.repository.ContactInquiryRepository;
import com.chs.springboot.features.contact.service.SupportSseService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Telegram update(메시지) 처리 공통 로직.
 * Polling(TelegramPollingService) 과 Webhook(TelegramWebhookController) 이 함께 사용한다.
 * SSL 설정 후 telegram.mode=webhook 으로 전환해도 이 클래스는 변경 없이 재사용된다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TelegramUpdateProcessor {

    private static final Pattern ID_PATTERN = Pattern.compile("\\[문의 #([0-9a-f]{8})\\]");

    private final ContactInquiryRepository inquiryRepository;
    private final SupportSseService         sseService;

    /**
     * Telegram update 객체를 받아 관리자 답변 여부를 확인하고 DB에 저장한다.
     * reply_to_message 가 없는 일반 메시지는 무시한다.
     */
    public void process(Map<String, Object> update) {
        try {
            log.info("[DIAG] process() called — update_id={}, thread={}",
                    update.get("update_id"), Thread.currentThread().getName());

            @SuppressWarnings("unchecked")
            Map<String, Object> message = (Map<String, Object>) update.get("message");
            if (message == null) return;

            // 답장(Reply) 이 아닌 일반 메시지는 무시
            @SuppressWarnings("unchecked")
            Map<String, Object> replyTo = (Map<String, Object>) message.get("reply_to_message");
            if (replyTo == null) return;

            // 원본 메시지에서 inquiryId 앞 8자 추출 (이미지 첨부 메시지는 caption 필드 사용)
            String originalText = (String) replyTo.get("text");
            if (originalText == null) {
                originalText = (String) replyTo.get("caption");
            }
            if (originalText == null) return;

            Matcher matcher = ID_PATTERN.matcher(originalText);
            if (!matcher.find()) {
                log.debug("Reply without inquiryId, ignored");
                return;
            }
            String shortId = matcher.group(1);

            // DB에서 해당 문의 조회
            Optional<ContactInquiry> opt = inquiryRepository.findAll().stream()
                    .filter(i -> i.getInquiryId().startsWith(shortId))
                    .findFirst();

            if (opt.isEmpty()) {
                log.warn("No inquiry found for id prefix={}", shortId);
                return;
            }

            String newReply = (String) message.get("text");
            if (newReply == null || newReply.isBlank()) return;

            ContactInquiry inquiry = opt.get();

            // 기존 답변에 타임스탬프 구분자로 이어붙이기 (복수 답변 지원)
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm"));
            String existing  = inquiry.getReplyText();
            String appended  = (existing == null || existing.isBlank())
                    ? "[" + timestamp + "] " + newReply
                    : existing + "\n[" + timestamp + "] " + newReply;

            inquiry.setReplyText(appended);
            if (inquiry.getRepliedAt() == null) inquiry.setRepliedAt(LocalDateTime.now()); // 최초 답변 시각만 기록
            inquiry.setReadAt(null); // 새 답변 도착 → 읽음 초기화
            inquiryRepository.save(inquiry);

            // SSE로 실시간 알림 (guestToken 없는 구 데이터는 무시)
            sseService.notify(inquiry.getGuestToken());

            log.info("Reply saved for inquiryId={}", inquiry.getInquiryId());

        } catch (Exception e) {
            log.error("Telegram update processing error: {}", e.getMessage());
        }
    }
}
