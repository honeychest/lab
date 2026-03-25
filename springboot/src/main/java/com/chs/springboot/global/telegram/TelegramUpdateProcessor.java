// [AGENT] 텔레그램 update(메시지) 처리 공통 로직.
// 역할: 관리자 답장 수신 → reply_to_message.text 또는 caption에서 inquiryId 추출
//       → 복수 답장은 [HH:mm] 타임스탬프 구분자로 이어붙이기 → readAt 초기화
// 중복 방지: processedIds(LinkedHashSet, 최대 1000개)로 동일 update_id 재처리 차단
//           (로컬+서버 동시 polling 등 다중 인스턴스 환경에서 방어막 역할)
// 연관: TelegramPollingService.java, TelegramWebhookController.java, ContactInquiry.java
package com.chs.springboot.global.telegram;

import com.chs.springboot.features.contact.entity.ContactInquiry;
import com.chs.springboot.features.contact.repository.ContactInquiryRepository;
import com.chs.springboot.features.contact.service.SupportSseService;
import com.chs.springboot.global.monitor.service.IpApprovalProcessor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

    /** 이미 처리한 update_id 캐시 — 동일 JVM 내 중복 처리 방지 (최대 1000개, 오래된 것 자동 제거) */
    private final Set<Long> processedIds = Collections.newSetFromMap(
            Collections.synchronizedMap(new LinkedHashMap<>() {
                @Override
                protected boolean removeEldestEntry(Map.Entry<Long, Boolean> eldest) {
                    return size() > 1000;
                }
            })
    );

    private final ContactInquiryRepository inquiryRepository;
    private final SupportSseService         sseService;
    private final IpApprovalProcessor       ipApprovalProcessor;
    private final StringRedisTemplate       redisTemplate;

    /**
     * Telegram update 객체를 받아 관리자 답변 여부를 확인하고 DB에 저장한다.
     * reply_to_message 가 없는 일반 메시지는 무시한다.
     */
    public void process(Map<String, Object> update) {
        try {
            Long updateIdForLog = null;
            try {
                if (update.get("update_id") != null) {
                    updateIdForLog = ((Number) update.get("update_id")).longValue();
                }
            } catch (Exception ignored) {
            }

            // 동일 update_id 중복 처리 방지 (같은 인스턴스 내)
            Long updateId = update.get("update_id") != null
                    ? ((Number) update.get("update_id")).longValue()
                    : null;
            if (updateId != null) {
                Boolean firstSeen = redisTemplate.opsForValue()
                        .setIfAbsent("telegram:update:" + updateId, "1", Duration.ofHours(6));
                if (!Boolean.TRUE.equals(firstSeen)) {
                    log.warn("Duplicate update_id={} via Redis, skipping", updateId);
                    return;
                }
                processedIds.add(updateId);
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> message = (Map<String, Object>) update.get("message");
            if (message == null) {
                log.debug("TelegramUpdateProcessor: update_id={} has no message", updateIdForLog);
                return;
            }

            // 모니터링 IP 허용(수락) 명령 처리 (reply 여부와 무관)
            String text = (String) message.get("text");
            if (text != null && text.trim().startsWith("수락")) {
                String chatId = null;
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> chat = (Map<String, Object>) message.get("chat");
                    if (chat != null && chat.get("id") != null) {
                        chatId = String.valueOf(((Number) chat.get("id")).longValue());
                    }
                } catch (Exception ignored) {
                }
                log.info("TelegramUpdateProcessor: approval command received update_id={} chatId={} text={}",
                        updateIdForLog, chatId, text);
                ipApprovalProcessor.process(text, chatId);
                // 수락 메시지는 문의 답변 처리와 무관하므로 여기서 종료
                return;
            }

            // 답장(Reply) 이 아닌 일반 메시지는 무시
            @SuppressWarnings("unchecked")
            Map<String, Object> replyTo = (Map<String, Object>) message.get("reply_to_message");
            if (replyTo == null) {
                log.debug("TelegramUpdateProcessor: update_id={} non-reply message ignored", updateIdForLog);
                return;
            }

            // 원본 메시지에서 inquiryId 앞 8자 추출 (이미지 첨부 메시지는 caption 필드 사용)
            String originalText = (String) replyTo.get("text");
            if (originalText == null) {
                originalText = (String) replyTo.get("caption");
            }
            if (originalText == null) {
                log.debug("TelegramUpdateProcessor: update_id={} reply has no text/caption", updateIdForLog);
                return;
            }

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
