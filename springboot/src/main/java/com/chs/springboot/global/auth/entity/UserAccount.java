// [AGENT] 사용자 계정 엔티티 — 로그인 대상 계정과 상태/비밀번호 해시를 보관
package com.chs.springboot.global.auth.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

// 이 파일부러 Flyway 적용 후 만들어진거라 comment 가 없음.(Flyway DDL 이 먼저 생성하므로)
@Entity
@Table(name = "user_account")
@Getter
@Setter
public class UserAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY) // 이게 AUTO_INCREMENT 해줌
    @Column
    private Long id;

    @Column(name = "email", nullable = false, unique = true, length = 80)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "enabled", nullable = false)
    private Boolean enabled;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
