// [AGENT] 방문자 페이지 접속 이력 엔티티 (VisitorLogInterceptor 저장용)
package com.chs.springboot.global.monitor.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(
        name = "visitor_log",
        indexes = {
                @Index(name = "idx_visitor_log_visited_at", columnList = "visited_at"),
                @Index(name = "idx_visitor_log_ip", columnList = "ip, visited_at")
        }
)
public class VisitorLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("PK")
    private Long id;

    @Comment("방문자 IP")
    @Column(name = "ip", nullable = false, length = 45)
    private String ip;

    @Comment("접속 경로")
    @Column(name = "path", nullable = false, length = 255)
    private String path;

    @Comment("접속 일시")
    @Column(name = "visited_at", nullable = false)
    private LocalDateTime visitedAt;

    @PrePersist
    void onPersist() {
        if (visitedAt == null) {
            visitedAt = LocalDateTime.now();
        }
    }
}
