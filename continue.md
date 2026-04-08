# 이어서 작업하기

## 대기 중인 작업

### 1. s3_archive_log 테이블 구현

**배경**: S3에 이관된 데이터 건수를 Monitor 화면에 표시하기 위해 DB에 이력을 남기는 구조.
수동 아카이빙이 전부 끝난 후 기존 S3 파일들을 초기 데이터로 넣고, 이후엔 자동 누적.

**테이블 설계**
```sql
CREATE TABLE s3_archive_log (
    id               BIGINT AUTO_INCREMENT  COMMENT '기본키',
    table_name       VARCHAR(100) NOT NULL  COMMENT '아카이빙 대상 테이블명',
    s3_key           VARCHAR(500) NOT NULL  COMMENT 'S3 오브젝트 키',
    range_label      VARCHAR(100) NOT NULL  COMMENT '아카이빙 범위 레이블',
    range_start      DATETIME(3)  NOT NULL  COMMENT '아카이빙 범위 시작 (UTC)',
    range_end        DATETIME(3)  NOT NULL  COMMENT '아카이빙 범위 종료 (UTC)',
    row_count        BIGINT NOT NULL        COMMENT '아카이빙 행 수',
    file_size_bytes  BIGINT NOT NULL        COMMENT 'S3 파일 크기 bytes',
    trigger_type     VARCHAR(20)  NOT NULL  COMMENT '실행 유형 (SCHEDULER / MANUAL / SCANNER)',
    complete         CHAR(1)      NOT NULL  DEFAULT 'N'  COMMENT 'DB 삭제 완료 여부 (N / Y)',
    uploaded_at      DATETIME(6)  NOT NULL  COMMENT 'S3 업로드 완료 시각',
    PRIMARY KEY (id),
    UNIQUE KEY uq_s3_key (s3_key)           COMMENT 'S3 key 중복 방지'
) COMMENT 'S3 아카이빙 이력';
```

**동작 흐름**
- S3 업로드 완료 직후 → INSERT (complete='N')
- DB 삭제 완료 후 → UPDATE complete='Y'
- s3KeyExists 복구 경로도 동일하게 삭제 완료 후 UPDATE
- ArchiveScanService 초기화: S3 ListObjectsV2 → 파일명 파싱(range_start/end) + LastModified(uploaded_at) + Size + S3 Select COUNT → INSERT (complete='Y', trigger_type='SCANNER')

**구현 순서 (1~9)**
1. DB 마이그레이션 SQL — s3_archive_log 테이블 생성
2. S3ArchiveLog 엔티티 + S3ArchiveLogRepository 생성
3. S3ArchiveService 수정
   - archive() 시그니처에 triggerType 파라미터 추가 (SCHEDULER / MANUAL)
   - S3 업로드 완료 직후 → INSERT (complete='N')
   - DB 삭제 완료 후 → UPDATE complete='Y'
4. RawAggTradeArchiveScheduler 수정 — archive() 호출 시 triggerType='SCHEDULER' 전달
5. ArchiveScanService 생성 — S3 ListObjectsV2 → 파일명 파싱 + LastModified + Size + S3 Select COUNT → INSERT (complete='Y', trigger_type='SCANNER')
6. ArchiveAdminController 수정
   - 기존 /run 호출 시 triggerType='MANUAL' 전달
   - POST /api/admin/archive/scan 엔드포인트 추가
7. MetricSnapshot에 rawAggTradeS3Rows 필드 추가
8. MetricCollectorService 수정 — SUM(row_count) WHERE complete='Y' 조회해서 스냅샷에 포함
9. MonitorPage.jsx 수정 — RawAggTrade 행 옆에 S3 이관 건수 표시

**주의사항**
- 수동 아카이빙 완전히 끝난 후 스캔 실행해야 누계가 정확함
- S3 Select는 기존 파일 초기화 1회만 사용, 이후는 INSERT로 누적
- raw_agg_trade 15일 보존 로직 버그 있음 (현재 ~14일치만 보존) — 의도적으로 방치 중 (스케줄러 테스트 목적)
