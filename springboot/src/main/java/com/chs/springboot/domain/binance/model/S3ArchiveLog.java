// [AGENT] 역할: S3 아카이빙 이력 엔티티 (s3_archive_log 테이블) | 연관파일: S3ArchiveLogRepository.java, S3ArchiveService.java, ArchiveScanService.java
// complete='N' → 업로드 완료/삭제 미완료, 'Y' → 삭제 완료
package com.chs.springboot.domain.binance.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.Comment;

import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@Table(
        name = "s3_archive_log",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_s3_key",
                columnNames = {"s3_key"}
        )
)
public class S3ArchiveLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Comment("기본키")
    private Long id;

    @Comment("아카이빙 대상 테이블명")
    @Column(name = "table_name", nullable = false, length = 100)
    private String tableName;

    @Comment("S3 오브젝트 키")
    @Column(name = "s3_key", nullable = false, length = 500)
    private String s3Key;

    @Comment("아카이빙 범위 레이블")
    @Column(name = "range_label", nullable = false, length = 100)
    private String rangeLabel;

    @Comment("아카이빙 범위 시작 (UTC)")
    @Column(name = "range_start", nullable = false)
    private LocalDateTime rangeStart;

    @Comment("아카이빙 범위 종료 (UTC)")
    @Column(name = "range_end", nullable = false)
    private LocalDateTime rangeEnd;

    @Comment("아카이빙 행 수")
    @Column(name = "row_count", nullable = false)
    private Long rowCount;

    @Comment("S3 파일 크기 bytes")
    @Column(name = "file_size_bytes", nullable = false)
    private Long fileSizeBytes;

    @Comment("실행 유형 (SCHEDULER / MANUAL / SCANNER)")
    @Column(name = "trigger_type", nullable = false, length = 20)
    private String triggerType;

    @Comment("DB 삭제 완료 여부 (N / Y)")
    @Column(name = "complete", nullable = false, length = 1)
    private String complete;

    @Comment("S3 업로드 완료 시각")
    @Column(name = "uploaded_at", nullable = false)
    private LocalDateTime uploadedAt;
}
