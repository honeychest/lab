-- [AGENT] S3 아카이빙 이력 테이블 생성
CREATE TABLE `s3_archive_log` (
    `id`              BIGINT         NOT NULL AUTO_INCREMENT              COMMENT '기본키',
    `table_name`      VARCHAR(100)   NOT NULL                            COMMENT '아카이빙 대상 테이블명',
    `s3_key`          VARCHAR(500)   NOT NULL                            COMMENT 'S3 오브젝트 키',
    `range_label`     VARCHAR(100)   NOT NULL                            COMMENT '아카이빙 범위 레이블',
    `range_start`     DATETIME(3)    NOT NULL                            COMMENT '아카이빙 범위 시작 (UTC)',
    `range_end`       DATETIME(3)    NOT NULL                            COMMENT '아카이빙 범위 종료 (UTC)',
    `row_count`       BIGINT         NOT NULL                            COMMENT '아카이빙 행 수',
    `file_size_bytes` BIGINT         NOT NULL                            COMMENT 'S3 파일 크기 bytes',
    `trigger_type`    VARCHAR(20)    NOT NULL                            COMMENT '실행 유형 (SCHEDULER / MANUAL / SCANNER)',
    `complete`        CHAR(1)        NOT NULL DEFAULT 'N'                COMMENT 'DB 삭제 완료 여부 (N / Y)',
    `uploaded_at`     DATETIME(6)    NOT NULL                            COMMENT 'S3 업로드 완료 시각',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_s3_key` (`s3_key`)                                    COMMENT 'S3 key 중복 방지'
) COMMENT 'S3 아카이빙 이력';
