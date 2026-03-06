package com.chs.springboot.features.contact.controller;

// [AGENT] 문의 REST API — 전송/목록조회/읽음처리
// 주요 엔드포인트: POST /inquiry, GET /inquiries, PATCH /reply/{id}/read
// 연관: ContactInquiry.java, ContactInquiryRepository.java, contactApi.js

import com.chs.springboot.features.contact.entity.ContactInquiry;
import com.chs.springboot.features.contact.repository.ContactInquiryRepository;
import com.chs.springboot.features.contact.service.SupportSseService;
import com.chs.springboot.global.security.MagicBytesValidator;
import com.chs.springboot.global.security.SafeBrowsingService;
import com.chs.springboot.global.telegram.TelegramProvider;
import com.chs.springboot.global.security.VirusTotalService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.util.HtmlUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/support")
@RequiredArgsConstructor
public class ContactController {

    private static final int MAX_MESSAGE_LENGTH = 300;
    private static final long MAX_FILE_SIZE     = 10L * 1024 * 1024; // 10MB (백엔드 2차 방어)

    private final TelegramProvider           telegramProvider;
    private final SafeBrowsingService        safeBrowsingService;
    private final VirusTotalService          virusTotalService;
    private final ContactInquiryRepository   inquiryRepository;
    private final SupportSseService          sseService;

    @PostMapping(value = "/inquiry", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<String> receiveInquiry(
            @RequestParam("message")    String message,
            @RequestParam("inquiryId")  String inquiryId,
            @RequestParam("guestToken") String guestToken,
            @RequestPart(value = "file", required = false) MultipartFile file,
            HttpServletRequest request
    ) throws Exception {

        // 1. 입력값 검증
        String trimmed = message == null ? "" : message.trim();
        if (trimmed.isBlank())                     return ResponseEntity.badRequest().body("메시지를 입력해 주세요.");
        if (trimmed.length() > MAX_MESSAGE_LENGTH)  return ResponseEntity.badRequest().body("메시지는 300자 이내로 입력해 주세요.");

        // UUID 형식 간단 검증 (36자, 하이픈 포함)
        if (inquiryId == null || !inquiryId.matches("[0-9a-f\\-]{36}")) {
            return ResponseEntity.badRequest().body("잘못된 요청입니다.");
        }
        if (guestToken == null || !guestToken.matches("[0-9a-f\\-]{36}")) {
            return ResponseEntity.badRequest().body("잘못된 요청입니다.");
        }

        // 2. XSS 방어 — HTML 엔티티 이스케이프
        String sanitized = HtmlUtils.htmlEscape(trimmed);

        // 3. 악성 URL 검사 (Google Safe Browsing)
        if (!safeBrowsingService.isSafe(sanitized)) {
            return ResponseEntity.badRequest().body("위험한 링크가 포함되어 있습니다.");
        }

        // 관리자가 Telegram에서 Reply 시 inquiryId로 매칭할 수 있도록 포함
        String shortId = inquiryId.substring(0, 8);
        String formattedMessage = String.format("[문의 #%s]\n%s", shortId, sanitized);

        // 4. 파일 포함 시 추가 보안 검사
        if (file != null && !file.isEmpty()) {

            // 4-1. 파일 크기 (프론트 압축 후에도 10MB 초과 시 차단)
            if (file.getSize() > MAX_FILE_SIZE) {
                return ResponseEntity.badRequest().body("파일 크기가 10MB를 초과합니다.");
            }

            // 4-2. Magic Bytes — 실제 이미지 형식 검증 (확장자 위조 차단)
            if (!MagicBytesValidator.isValidImage(file)) {
                return ResponseEntity.badRequest().body("지원하지 않는 파일 형식입니다.");
            }

            // 4-3. VirusTotal — 알려진 악성 파일 차단
            byte[] fileBytes = file.getBytes();
            if (!virusTotalService.isSafe(fileBytes)) {
                return ResponseEntity.badRequest().body("보안 위협이 감지된 파일입니다.");
            }

            telegramProvider.sendPhoto(formattedMessage, fileBytes, file.getOriginalFilename());
        } else {
            telegramProvider.sendMessage(formattedMessage);
        }

        // 5. DB 저장 (inquiryId 중복 시 덮어쓰기 — 동일 브라우저 재전송 허용)
        ContactInquiry inquiry = inquiryRepository.findByInquiryId(inquiryId)
                .orElseGet(ContactInquiry::new);
        inquiry.setInquiryId(inquiryId);
        inquiry.setGuestToken(guestToken);
        inquiry.setClientIp(extractClientIp(request));
        inquiry.setPlatform(extractPlatform(request.getHeader("User-Agent")));
        inquiry.setMessage(sanitized);
        inquiry.setReplyText(null);
        inquiry.setRepliedAt(null);
        inquiry.setReadAt(null);
        inquiryRepository.save(inquiry);

        return ResponseEntity.ok("success");
    }

    /** guestToken 기반 문의 목록 조회 (최신순) */
    @GetMapping("/inquiries")
    public ResponseEntity<?> getInquiries(@RequestParam String guestToken) {
        if (guestToken == null || !guestToken.matches("[0-9a-f\\-]{36}")) {
            return ResponseEntity.badRequest().build();
        }
        List<ContactInquiry> list = inquiryRepository.findByGuestTokenOrderByCreatedAtDesc(guestToken);
        List<Map<String, Object>> result = list.stream().map(i -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("inquiryId", i.getInquiryId());
            m.put("message",   i.getMessage());
            m.put("createdAt", i.getCreatedAt().toString());
            m.put("replyText", i.getReplyText());
            m.put("repliedAt", i.getRepliedAt() != null ? i.getRepliedAt().toString() : null);
            m.put("readAt",    i.getReadAt()    != null ? i.getReadAt().toString()    : null);
            return m;
        }).toList();
        return ResponseEntity.ok(result);
    }

    /** 답변 읽음 처리 — guestToken 일치 확인 후 readAt 저장 */
    @PatchMapping("/reply/{inquiryId}/read")
    public ResponseEntity<?> markAsRead(
            @PathVariable String inquiryId,
            @RequestBody Map<String, String> body) {
        String guestToken = body.get("guestToken");
        Optional<ContactInquiry> opt = inquiryRepository.findByInquiryId(inquiryId);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        ContactInquiry inquiry = opt.get();
        if (inquiry.getGuestToken() == null || !inquiry.getGuestToken().equals(guestToken)) {
            return ResponseEntity.status(403).build();
        }
        if (inquiry.getReadAt() != null) return ResponseEntity.ok().build(); // 이미 읽음
        inquiry.setReadAt(LocalDateTime.now());
        inquiryRepository.save(inquiry);
        return ResponseEntity.ok().build();
    }

    /** SSE 구독 — guestToken 기반 실시간 답장 알림 (Nginx에서 항상 app1으로 라우팅) */
    @GetMapping(value = "/notify", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@RequestParam String guestToken) {
        if (guestToken == null || !guestToken.matches("[0-9a-f\\-]{36}")) {
            throw new IllegalArgumentException("잘못된 guestToken");
        }
        return sseService.subscribe(guestToken);
    }

    /** X-Real-IP (Nginx 설정값) → remoteAddr 순으로 실제 IP 추출 */
    private String extractClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Real-IP");
        if (ip != null && !ip.isBlank()) return ip;
        return request.getRemoteAddr();
    }

    /** User-Agent 기반 플랫폼 판별 */
    private String extractPlatform(String userAgent) {
        if (userAgent == null) return "unknown";
        String ua = userAgent.toLowerCase();
        if (ua.contains("iphone") || ua.contains("ipad") || ua.contains("ipod")) return "ios";
        if (ua.contains("android")) return "android";
        return "desktop";
    }
}
