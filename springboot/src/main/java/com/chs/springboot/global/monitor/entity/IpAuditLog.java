// [AGENT] IP 감사로그 엔티티 (REQUEST/APPROVE/EXPIRE)
package com.chs.springboot.global.monitor.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(
        name = "ip_audit_log",
        indexes = {
                @Index(name = "idx_ip_audit_occurred_at", columnList = "occurred_at"),
                @Index(name = "idx_ip_audit_ip", columnList = "ip, occurred_at")
        }
)
public class IpAuditLog {

    public enum EventType {
        REQUEST, APPROVE, EXPIRE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private EventType eventType;

    @Column(name = "ip", nullable = false, length = 45)
    private String ip;

    @Column(name = "request_id", length = 8)
    private String requestId;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    @PrePersist
    void onPersist() {
        if (occurredAt == null) {
            occurredAt = LocalDateTime.now();
        }
    }
}

