// [AGENT] 역할: raw_agg_trade 아카이빙 스케줄러 | 연관파일: S3ArchiveService.java, MetricCollectorService.java, RawAggTradeRepository.java
// 실행 조건: CPU < archive.cpu-max-percent (진입 70%, 배치 중 90% 초과 시 중단)
// 보존 기간: archive.retention-days 이전 데이터를 하루 단위로 S3 아카이빙
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.repository.RawAggTradeRepository;
import com.chs.springboot.global.monitor.service.MetricCollectorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

@Slf4j
@Service
public class RawAggTradeArchiveScheduler {

    private final RawAggTradeRepository rawAggTradeRepository;
    private final S3ArchiveService s3ArchiveService;
    private final MetricCollectorService metricCollectorService;

    @Value("${archive.retention-days:15}")
    private int retentionDays;

    @Value("${archive.cpu-max-percent:70.0}")
    private double cpuMaxPercent;

    public RawAggTradeArchiveScheduler(RawAggTradeRepository rawAggTradeRepository,
                                       S3ArchiveService s3ArchiveService,
                                       MetricCollectorService metricCollectorService) {
        this.rawAggTradeRepository = rawAggTradeRepository;
        this.s3ArchiveService = s3ArchiveService;
        this.metricCollectorService = metricCollectorService;
    }

    /**
     * 10분마다 실행. 아래 조건 충족 시 하루치 데이터 아카이빙 수행.
     * - CPU < cpuMaxPercent (70%)
     * - 보존 기간(retentionDays) 이전 데이터 존재
     *
     * initialDelay: 서버 기동 안정화 후 1분 뒤 첫 실행
     */
    @Scheduled(fixedDelay = 600_000L, initialDelay = 60_000L)
    public void run() {
        double cpu = metricCollectorService.getLastCpu();
        if (cpu >= 0 && cpu >= cpuMaxPercent) {
            log.warn("[Archive] CPU={}% 초과 — 스킵 (임계값={}%)", String.format("%.1f", cpu), cpuMaxPercent);
            return;
        }

        long retentionMs = (long) retentionDays * 24 * 60 * 60 * 1_000; // retentionDays * 하루치 밀리세컨드
        long cutoffMs = System.currentTimeMillis() - retentionMs;

        Long minTradedAt = rawAggTradeRepository.findMinTradedAtBefore(cutoffMs);
        if (minTradedAt == null) {
            log.warn("[Archive] 아카이빙 대상 없음 (보존기간 {}일)", retentionDays);
            return;
        }

        LocalDate date = Instant.ofEpochMilli(minTradedAt)
                .atZone(ZoneOffset.UTC)
                .toLocalDate();

        long startMs = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();
        long endMs = date.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();

        log.warn("[Archive] 시작: date={} cpu={}%", date, String.format("%.1f", cpu));
        s3ArchiveService.archive(startMs, endMs);
    }
}
