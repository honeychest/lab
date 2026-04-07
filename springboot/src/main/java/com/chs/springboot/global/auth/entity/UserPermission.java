// [AGENT] 권한 코드 엔티티 — ADMIN_ACCESS 같은 시스템 권한 마스터 데이터
package com.chs.springboot.global.auth.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_permission")
@Getter
@Setter
public class UserPermission {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY) // 이게 AUTO_INCREMENT 해줌
    @Column
    private Long id;

    @Column(name = "code", nullable = false, unique = true, length = 20)
    private String code;

    @Column(name = "name", nullable = false, length = 40)
    private String name;

    @Column(name = "description", nullable = false, length = 255)
    private String description;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
