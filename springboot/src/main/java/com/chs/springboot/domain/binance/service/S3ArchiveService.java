// [AGENT] 역할: raw_agg_trade 데이터를 CSV로 변환 → S3 업로드 → DB 삭제 | 연관파일: RawAggTradeRepository.java, S3Config.java, RawAggTradeArchiveScheduler.java
// S3 key: raw_agg_trade/{startMs}_{endMs}.csv (고정키 → 재시작 시 덮어쓰기로 안전)
// 배치 삭제 중 CPU > DELETE_CPU_MAX_PERCENT(90%) 초과 시 중단, 다음 스케줄 주기에 이어서 실행
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.RawAggTrade;
import com.chs.springboot.domain.binance.repository.RawAggTradeRepository;
import com.chs.springboot.global.monitor.service.MetricCollectorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.StorageClass;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Slf4j
@Service
public class S3ArchiveService {

    private static final int PAGE_SIZE = 5_000;
    private static final int DELETE_BATCH_SIZE = 5_000;
    private static final int DELETE_INTERVAL_MS = 50;
    private static final double DELETE_CPU_MAX_PERCENT = 90.0; // 배치 삭제 중 CPU 재체크 임계값
    private static final int DELETE_CPU_WAIT_MS = 10_000;      // CPU 초과 시 대기 시간 (10초)
    private static final DateTimeFormatter KEY_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss").withZone(ZoneOffset.UTC);

    private final S3Client s3Client;
    private final RawAggTradeRepository rawAggTradeRepository;
    private final MetricCollectorService metricCollectorService;

    @Value("${cloud.aws.s3.bucket}")
    private String bucket;

    public S3ArchiveService(S3Client s3Client, RawAggTradeRepository rawAggTradeRepository,
                            MetricCollectorService metricCollectorService) {
        this.s3Client = s3Client;
        this.rawAggTradeRepository = rawAggTradeRepository;
        this.metricCollectorService = metricCollectorService;
    }

    /**
     * 지정 범위의 raw_agg_trade 데이터를 S3에 업로드하고 DB에서 삭제한다.
     * 스케줄러/수동 실행 모두 이 메서드를 통해 동일한 로직으로 처리한다.
     *
     * S3 key가 startMs/endMs 기반으로 고정되므로 중간 재시작 시 덮어쓰기로 안전.
     *
     * @param startMs 시작 Unix ms (inclusive)
     * @param endMs   종료 Unix ms (exclusive)
     * @return 처리 결과
     */
    public ArchiveResult archive(long startMs, long endMs) {
        String rangeLabel = KEY_FORMATTER.format(Instant.ofEpochMilli(startMs))
                + "_" + KEY_FORMATTER.format(Instant.ofEpochMilli(endMs));
        String s3Key = "raw_agg_trade/" + rangeLabel + ".csv";
        File tempFile = null;
        long totalStart = System.currentTimeMillis();

        try {
            // 1. 건수 조회
            long countStart = System.currentTimeMillis();
            long totalCount = rawAggTradeRepository.countByTradedAtRange(startMs, endMs);
            long countElapsedMs = System.currentTimeMillis() - countStart;

            if (totalCount == 0) {
                log.warn("[Archive] 대상 데이터 없음 — 스킵: range={}", rangeLabel);
                return ArchiveResult.skipped(rangeLabel);
            }

            // 2. S3 key 존재 확인 — 이미 업로드된 경우 CSV 생성/업로드 스킵 (재시작 복구용)
            long uploadElapsedMs = 0;
            long fileSize = 0;
            if (s3KeyExists(s3Key)) {
                log.warn("[Archive] S3 key 이미 존재 — 업로드 스킵, 삭제만 진행: key={}", s3Key);
            } else {
                long uploadStart = System.currentTimeMillis();
                tempFile = writeToCsvTempFile(startMs, endMs, rangeLabel);
                fileSize = tempFile.length();

                PutObjectRequest putRequest = PutObjectRequest.builder()
                        .bucket(bucket)
                        .key(s3Key)
                        .storageClass(StorageClass.STANDARD)
                        .build();

                s3Client.putObject(putRequest, RequestBody.fromFile(tempFile));
                uploadElapsedMs = System.currentTimeMillis() - uploadStart;
                log.warn("[Archive] S3 업로드 완료: key={} size={}bytes elapsed={}ms", s3Key, fileSize, uploadElapsedMs);
            }

            // 3. DB 삭제
            long deleteStart = System.currentTimeMillis();
            int totalDeleted = deleteInBatches(startMs, endMs, rangeLabel);
            long deleteElapsedMs = System.currentTimeMillis() - deleteStart;

            long totalElapsedMs = System.currentTimeMillis() - totalStart;
            long perRecordMs = totalCount > 0 ? totalElapsedMs / totalCount : 0;

            log.warn("[Archive] 완료: range={} count={} total={}ms upload={}ms delete={}ms perRecord={}ms",
                    rangeLabel, totalDeleted, totalElapsedMs, uploadElapsedMs, deleteElapsedMs, perRecordMs);

            return ArchiveResult.success(rangeLabel, s3Key, totalCount, totalDeleted, fileSize,
                    countElapsedMs, uploadElapsedMs, deleteElapsedMs, totalElapsedMs, perRecordMs);

        } catch (Exception e) {
            log.error("[Archive] 실패: range={} error={}", rangeLabel, e.getMessage());
            return ArchiveResult.failure(rangeLabel, e.getMessage());

        } finally {
            if (tempFile != null && tempFile.exists()) {
                tempFile.delete();
            }
        }
    }

    private boolean s3KeyExists(String s3Key) {
        try {
            s3Client.headObject(HeadObjectRequest.builder().bucket(bucket).key(s3Key).build());
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        }
    }

    private File writeToCsvTempFile(long startMs, long endMs, String rangeLabel) throws IOException {
        File tempFile = File.createTempFile("raw_agg_trade_" + rangeLabel + "_", ".csv");
        boolean hasData = false;
        long lastId = 0L;

        try (BufferedWriter writer = new BufferedWriter(new FileWriter(tempFile))) {
            writer.write("id,symbol,market_type,agg_trade_id,price,quantity,first_trade_id,last_trade_id,is_buyer_maker,traded_at,saved_at");
            writer.newLine();

            while (true) {
                List<RawAggTrade> page = rawAggTradeRepository.findByTradedAtRangeAfterIdPaged(startMs, endMs, lastId, PAGE_SIZE);
                if (page.isEmpty()) {
                    break;
                }

                hasData = true;
                for (RawAggTrade trade : page) {
                    writer.write(toCsvLine(trade));
                    writer.newLine();
                }

                lastId = page.get(page.size() - 1).getId();
                if (page.size() < PAGE_SIZE) {
                    break;
                }
            }
        }

        if (!hasData) {
            tempFile.delete();
            return null;
        }
        return tempFile;
    }

    private int deleteInBatches(long startMs, long endMs, String rangeLabel) {
        int totalDeleted = 0;

        while (true) {
            // 배치마다 CPU 재체크 — 90% 초과 시 10초 대기 후 재시도 (서버 종료 시 InterruptedException으로 탈출)
            double cpu = metricCollectorService.getLastCpu();
            if (cpu >= 0 && cpu >= DELETE_CPU_MAX_PERCENT) {
                log.warn("[Archive] CPU={}% 초과 — {}ms 대기 후 재시도: range={} deletedSoFar={}",
                        String.format("%.1f", cpu), DELETE_CPU_WAIT_MS, rangeLabel, totalDeleted);
                try {
                    Thread.sleep(DELETE_CPU_WAIT_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
                continue;
            }

            int deleted = rawAggTradeRepository.deleteByTradedAtRangeBatch(startMs, endMs, DELETE_BATCH_SIZE);
            totalDeleted += deleted;

            if (deleted == 0) {
                break;
            }

            try {
                Thread.sleep(DELETE_INTERVAL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        log.warn("[Archive] DB 삭제 완료: range={} totalDeleted={}", rangeLabel, totalDeleted);
        return totalDeleted;
    }

    private String toCsvLine(RawAggTrade trade) {
        return String.join(",",
                String.valueOf(trade.getId()),
                trade.getSymbol(),
                trade.getMarketType(),
                String.valueOf(trade.getAggTradeId()),
                trade.getPrice().toPlainString(),
                trade.getQuantity().toPlainString(),
                String.valueOf(trade.getFirstTradeId()),
                String.valueOf(trade.getLastTradeId()),
                String.valueOf(trade.getIsBuyerMaker()),
                String.valueOf(trade.getTradedAt()),
                trade.getSavedAt() != null ? trade.getSavedAt().toString() : ""
        );
    }

    /**
     * 아카이빙 결과 반환 객체 — 단계별 소요시간 포함
     */
    public record ArchiveResult(
            String rangeLabel,
            String s3Key,
            long totalCount,        // 대상 건수
            int deletedCount,       // 실제 삭제 건수
            long fileSizeBytes,     // S3 업로드 파일 크기
            long countElapsedMs,    // 건수 조회 소요시간
            long uploadElapsedMs,   // S3 업로드 소요시간
            long deleteElapsedMs,   // DB 삭제 소요시간
            long totalElapsedMs,    // 전체 소요시간
            long perRecordMs,       // 건당 평균 소요시간
            boolean success,
            boolean skipped,
            String errorMessage
    ) {
        static ArchiveResult success(String rangeLabel, String s3Key, long totalCount, int deletedCount,
                                     long fileSizeBytes, long countElapsedMs, long uploadElapsedMs,
                                     long deleteElapsedMs, long totalElapsedMs, long perRecordMs) {
            return new ArchiveResult(rangeLabel, s3Key, totalCount, deletedCount, fileSizeBytes,
                    countElapsedMs, uploadElapsedMs, deleteElapsedMs, totalElapsedMs, perRecordMs, true, false, null);
        }

        static ArchiveResult skipped(String rangeLabel) {
            return new ArchiveResult(rangeLabel, null, 0, 0, 0, 0, 0, 0, 0, 0, true, true, null);
        }

        static ArchiveResult failure(String rangeLabel, String errorMessage) {
            return new ArchiveResult(rangeLabel, null, 0, 0, 0, 0, 0, 0, 0, 0, false, false, errorMessage);
        }
    }
}
