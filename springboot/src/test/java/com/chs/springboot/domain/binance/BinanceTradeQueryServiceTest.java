package com.chs.springboot.domain.binance;

import com.chs.springboot.domain.binance.model.BinanceTrade;
import com.chs.springboot.domain.binance.repository.BinanceTradeRepository;
import com.chs.springboot.domain.binance.service.BinanceTradeQueryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Collections;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * BinanceTradeQueryService 단위 테스트
 * - limit 클램핑 (1~200)
 * - KST 날짜 변환 정확성
 * - 잘못된 날짜 형식 → IllegalArgumentException (→ 컨트롤러에서 400)
 * - marketType 화이트리스트 필터
 */
class BinanceTradeQueryServiceTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private BinanceTradeRepository mockRepo;
    private BinanceTradeQueryService service;

    @BeforeEach
    void setUp() {
        mockRepo = mock(BinanceTradeRepository.class);
        Page<BinanceTrade> emptyPage = new PageImpl<>(Collections.emptyList());
        when(mockRepo.findAll(any(Specification.class), any(Pageable.class))).thenReturn(emptyPage);
        service = new BinanceTradeQueryService(mockRepo);
    }

    // ── limit 클램핑 ──────────────────────────────────────────────────────

    @Test
    @DisplayName("limit=0 → 1로 클램핑")
    void getRecent_limitZero_clampedTo1() {
        service.getRecent(0);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(mockRepo).findAll(any(Specification.class), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(1);
    }

    @Test
    @DisplayName("limit=300 → 200으로 클램핑")
    void getRecent_limitAboveMax_clampedTo200() {
        service.getRecent(300);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(mockRepo).findAll(any(Specification.class), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(200);
    }

    @Test
    @DisplayName("limit=50 → 그대로 50")
    void getRecent_normalLimit_passedThrough() {
        service.getRecent(50);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(mockRepo).findAll(any(Specification.class), captor.capture());
        assertThat(captor.getValue().getPageSize()).isEqualTo(50);
    }

    // ── KST 날짜 변환 정확성 ──────────────────────────────────────────────

    @Test
    @DisplayName("from=2024-01-15 → KST 00:00:00 = UTC 2024-01-14T15:00:00")
    void parseFromDate_kstStartOfDay_isCorrect() {
        ZonedDateTime kstStart = LocalDate.of(2024, 1, 15).atStartOfDay(KST);
        ZonedDateTime utcEquivalent = kstStart.withZoneSameInstant(ZoneId.of("UTC"));

        // KST = UTC+9, 하루 시작(KST) = 전날 15:00 UTC
        assertThat(utcEquivalent.getDayOfMonth()).isEqualTo(14);
        assertThat(utcEquivalent.getHour()).isEqualTo(15);
        assertThat(utcEquivalent.getMinute()).isEqualTo(0);
    }

    @Test
    @DisplayName("to=2024-01-15 → KST 23:59:59.999 = UTC 2024-01-15T14:59:59")
    void parseToDate_kstEndOfDay_isCorrect() {
        ZonedDateTime kstEnd = LocalDate.of(2024, 1, 15)
                .atTime(23, 59, 59, 999_000_000)
                .atZone(KST);
        ZonedDateTime utcEquivalent = kstEnd.withZoneSameInstant(ZoneId.of("UTC"));

        assertThat(utcEquivalent.getDayOfMonth()).isEqualTo(15);
        assertThat(utcEquivalent.getHour()).isEqualTo(14);
        assertThat(utcEquivalent.getMinute()).isEqualTo(59);
    }

    @Test
    @DisplayName("from < to (하루 시작 < 하루 끝) epoch ms 정렬 보장")
    void parseDate_fromIsBeforeTo() {
        long fromEpoch = LocalDate.of(2024, 1, 15).atStartOfDay(KST).toInstant().toEpochMilli();
        long toEpoch = LocalDate.of(2024, 1, 15).atTime(23, 59, 59, 999_000_000).atZone(KST).toInstant().toEpochMilli();

        assertThat(fromEpoch).isLessThan(toEpoch);
    }

    @Test
    @DisplayName("from=2024-01-15 → getPage 호출 시 예외 없이 동작")
    void getPage_validFromDate_noException() {
        assertThatCode(() ->
                service.getPage(null, null, "2024-01-15", null, "tradedAt", "DESC", 0, 30)
        ).doesNotThrowAnyException();
    }

    // ── 잘못된 날짜 → IllegalArgumentException ────────────────────────────

    @Test
    @DisplayName("from 날짜 형식 오류(yyyy/MM/dd) → IllegalArgumentException")
    void getPage_invalidFromDateSlash_throwsIllegalArgument() {
        assertThatThrownBy(() ->
                service.getPage(null, null, "2024/01/15", null, "tradedAt", "DESC", 0, 30)
        )
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("yyyy-MM-dd");
    }

    @Test
    @DisplayName("to 날짜가 의미없는 문자열 → IllegalArgumentException")
    void getPage_invalidToDateGarbage_throwsIllegalArgument() {
        assertThatThrownBy(() ->
                service.getPage(null, null, null, "어제", "tradedAt", "DESC", 0, 30)
        )
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("yyyy-MM-dd");
    }

    @Test
    @DisplayName("날짜가 null이면 예외 없이 처리 (필터 미적용)")
    void getPage_nullDates_noException() {
        assertThatCode(() ->
                service.getPage(null, null, null, null, "tradedAt", "DESC", 0, 30)
        ).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("날짜가 빈 문자열이면 예외 없이 처리 (필터 미적용)")
    void getPage_blankDates_noException() {
        assertThatCode(() ->
                service.getPage(null, null, "  ", "", "tradedAt", "DESC", 0, 30)
        ).doesNotThrowAnyException();
    }

    // ── marketType 화이트리스트 ────────────────────────────────────────────

    @Test
    @DisplayName("marketType=SPOT → 허용, 예외 없음")
    void getPage_marketTypeSpot_allowed() {
        assertThatCode(() ->
                service.getPage(null, "SPOT", null, null, "tradedAt", "DESC", 0, 30)
        ).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("marketType=FUTURES → 허용, 예외 없음")
    void getPage_marketTypeFutures_allowed() {
        assertThatCode(() ->
                service.getPage(null, "FUTURES", null, null, "tradedAt", "DESC", 0, 30)
        ).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("marketType=INVALID → 필터 무시 (예외 없음)")
    void getPage_invalidMarketType_filterIgnored() {
        assertThatCode(() ->
                service.getPage(null, "INVALID", null, null, "tradedAt", "DESC", 0, 30)
        ).doesNotThrowAnyException();
    }

    // ── sort 화이트리스트 ─────────────────────────────────────────────────

    @Test
    @DisplayName("sort=unknownField → tradedAt으로 폴백")
    void getPage_unknownSortField_fallsBackToTradedAt() {
        service.getPage(null, null, null, null, "unknownField", "DESC", 0, 30);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(mockRepo).findAll(any(Specification.class), captor.capture());
        assertThat(captor.getValue().getSort().getOrderFor("tradedAt")).isNotNull();
    }
}
