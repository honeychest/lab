-- s3_archive_log datetime 정밀도 통일 (DATETIME(6)/DATETIME(3) → DATETIME)
-- ALTER 시 MySQL이 기존 데이터 자동 truncate 처리
ALTER TABLE s3_archive_log
    MODIFY COLUMN uploaded_at DATETIME NOT NULL COMMENT 'S3 업로드 완료 시각',
    MODIFY COLUMN range_start DATETIME NOT NULL COMMENT '아카이빙 범위 시작 (UTC)',
    MODIFY COLUMN range_end   DATETIME NOT NULL COMMENT '아카이빙 범위 종료 (UTC)';
