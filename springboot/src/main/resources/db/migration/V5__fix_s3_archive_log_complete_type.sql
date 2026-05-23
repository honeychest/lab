ALTER TABLE `s3_archive_log` MODIFY COLUMN `complete` VARCHAR(1) NOT NULL DEFAULT 'N' COMMENT 'DB 삭제 완료 여부 (N / Y)';
