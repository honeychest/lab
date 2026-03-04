package com.chs.springboot.features.contact.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

// [AGENT] 사용자 문의 + 관리자 답변 엔티티
// 연관: ContactController.java, ContactInquiryRepository.java, TelegramUpdateProcessor.java

/**
 * 사용자 문의 + 관리자 답변을 함께 저장하는 엔티티.
 * ddl-auto=update 에 의해 서버 시작 시 contact_inquiry 테이블이 자동 생성된다.
 */
@Entity
@Table(name = "contact_inquiry")
@Getter
@Setter
@NoArgsConstructor
public class ContactInquiry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 프론트엔드에서 생성한 UUID (브라우저 localStorage 키) */
    @Column(name = "inquiry_id", nullable = false, unique = true, length = 36)
    private String inquiryId;

    /** 기기 영구 식별자 UUID (로그인 전 신원 추적용) */
    @Column(name = "guest_token", length = 36)
    private String guestToken;

    /** 요청 IP (X-Real-IP → remoteAddr 순 추출) */
    @Column(name = "client_ip", length = 45)
    private String clientIp;

    /** 요청 플랫폼 (ios / android / desktop) */
    @Column(name = "platform", length = 20)
    private String platform;

    /** 사용자가 입력한 문의 내용 (XSS 이스케이프 처리된 값) */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String message;

    /** 관리자가 텔레그램에서 보낸 답변 (null = 미답변, 복수 답변은 \n[HH:mm] 구분자로 이어붙임) */
    @Column(name = "reply_text", columnDefinition = "TEXT")
    private String replyText;

    /** 관리자 최초 답변 시각 */
    @Column(name = "replied_at")
    private LocalDateTime repliedAt;

    /** 사용자가 답변을 읽은 시각 (null = 미읽음) */
    @Column(name = "read_at")
    private LocalDateTime readAt;

    /** 문의 접수 시각 */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }
}
