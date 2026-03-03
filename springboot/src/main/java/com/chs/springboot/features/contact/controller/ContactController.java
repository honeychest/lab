package com.chs.springboot.features.contact.controller;

import com.chs.springboot.global.MagicBytesValidator;
import com.chs.springboot.global.SafeBrowsingService;
import com.chs.springboot.global.TelegramProvider;
import com.chs.springboot.global.VirusTotalService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.util.HtmlUtils;

@RestController
@RequestMapping("/api/support")
@RequiredArgsConstructor
public class ContactController {

    private static final int MAX_MESSAGE_LENGTH = 300;
    private static final long MAX_FILE_SIZE     = 10L * 1024 * 1024; // 10MB (백엔드 2차 방어)

    private final TelegramProvider    telegramProvider;
    private final SafeBrowsingService safeBrowsingService;
    private final VirusTotalService   virusTotalService;

    @PostMapping(value = "/inquiry", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<String> receiveInquiry(
            @RequestParam("message") String message,
            @RequestPart(value = "file", required = false) MultipartFile file
    ) throws Exception {

        // 1. 입력값 검증
        String trimmed = message == null ? "" : message.trim();
        if (trimmed.isBlank())                    return ResponseEntity.badRequest().body("메시지를 입력해 주세요.");
        if (trimmed.length() > MAX_MESSAGE_LENGTH) return ResponseEntity.badRequest().body("메시지는 300자 이내로 입력해 주세요.");

        // 2. XSS 방어 — HTML 엔티티 이스케이프
        String sanitized = HtmlUtils.htmlEscape(trimmed);

        // 3. 악성 URL 검사 (Google Safe Browsing)
        if (!safeBrowsingService.isSafe(sanitized)) {
            return ResponseEntity.badRequest().body("위험한 링크가 포함되어 있습니다.");
        }

        String formattedMessage = String.format("[사용자 문의]\n내용: %s", sanitized);

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

        return ResponseEntity.ok("success");
    }
}
