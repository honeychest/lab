# 이어서 작업하기

## 대기 중인 작업

### 1. archive_log 테이블 구현 (수동 아카이빙 완전 완료 후 시작)

**배경**: S3에 이관된 데이터 건수를 Monitor 화면에 표시하기 위해 DB에 이력을 남기는 구조.
수동 아카이빙이 전부 끝난 후 기존 S3 파일들을 초기 데이터로 넣고, 이후엔 자동 누적.

**테이블 설계**
```sql
CREATE TABLE archive_log (
    id              BIGINT AUTO_INCREMENT  COMMENT '기본키',
    table_name      VARCHAR(100) NOT NULL  COMMENT '아카이빙 대상 테이블명',
    s3_key          VARCHAR(500) NOT NULL  COMMENT 'S3 오브젝트 키',
    range_label     VARCHAR(100) NOT NULL  COMMENT '아카이빙 범위 (yyyy-MM-dd_HH-mm-ss_yyyy-MM-dd_HH-mm-ss)',
    row_count       BIGINT NOT NULL        COMMENT '아카이빙 행 수',
    file_size_bytes BIGINT NOT NULL        COMMENT 'S3 파일 크기 bytes',
    archived_at     DATETIME(6) NOT NULL   COMMENT '완료 시각',
    PRIMARY KEY (id),
    UNIQUE KEY uq_s3_key (s3_key)          COMMENT 'S3 key 중복 방지'
) COMMENT 'S3 아카이빙 이력';
```

**구현 순서**
1. `ArchiveLog` 엔티티 + `ArchiveLogRepository`
2. `S3ArchiveService` — 아카이빙 완료 시 archive_log INSERT
3. `ArchiveScanService` — 기존 S3 파일 스캔 → S3 Select COUNT → INSERT (초기화 1회용)
4. `ArchiveAdminController` — POST /api/admin/archive/scan 엔드포인트 추가
5. Monitor API — `SUM(row_count) GROUP BY table_name` 반환
6. MonitorPage — raw_agg_trade DB 건수 옆에 S3 이관 건수 표시

**주의사항**
- 수동 아카이빙 완전히 끝난 후 스캔 실행해야 누계가 정확함
- S3 Select는 기존 파일 초기화 1회만 사용, 이후는 INSERT로 누적
- raw_agg_trade 15일 보존 로직 버그 있음 (현재 ~14일치만 보존) — 의도적으로 방치 중 (스케줄러 테스트 목적)

### 2. 어드민 데이터 품질 삭제 수정 (커밋 필요)
`ManualBackfillController`, `ManualBackfillService`, `AdminPage.jsx` 수정 완료, 미커밋 상태.
