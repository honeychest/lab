// [AGENT] 체결 내역 조회 서비스 — recent(최신순), before(무한스크롤), page(조회 패널)
// 연관파일: BinanceTradeRepository.java, BinanceTradeDto.java, BinanceTradeController.java
// 주요메서드: getRecent(), getRecentBefore(), getPage() | from/to: yyyy-MM-dd → KST epoch ms 변환
package com.chs.springboot.domain.binance.service;

import com.chs.springboot.domain.binance.model.BinanceTrade;
import com.chs.springboot.domain.binance.model.BinanceTradeDto;
import com.chs.springboot.domain.binance.repository.BinanceTradeRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class BinanceTradeQueryService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final Set<String> ALLOWED_SORT_FIELDS = Set.of("tradedAt", "price", "quantity", "tradeValue");

    private final BinanceTradeRepository repository;

    /** 최신 N건 (id DESC) — 초기 로드 및 SSE 재연결 후 재조회 */
    public List<BinanceTradeDto> getRecent(int limit) {
        int safeLimit = Math.min(Math.max(limit, 1), 200);
        Pageable pageable = PageRequest.of(0, safeLimit, Sort.by(Sort.Direction.DESC, "id"));
        return repository.findAll(Specification.where(null), pageable)
                .getContent().stream().map(BinanceTradeDto::from).toList();
    }

    /** before-id 기반 추가 로드 (모바일 무한스크롤) */
    public List<BinanceTradeDto> getRecentBefore(Long beforeId, int limit) {
        int safeLimit = Math.min(Math.max(limit, 1), 50);
        Pageable pageable = PageRequest.of(0, safeLimit);
        return repository.findByIdLessThanOrderByIdDesc(beforeId, pageable)
                .stream().map(BinanceTradeDto::from).toList();
    }

    /** 조회 패널 페이지네이션 — 동적 필터 + 정렬 */
    public Map<String, Object> getPage(
            String symbol, String marketType,
            String from, String to,
            String sort, String order,
            int page, int size) {

        int safeSize = (size == 30 || size == 90 || size == 200) ? size : 30;
        int safePage = Math.max(0, page);
        String sortField = ALLOWED_SORT_FIELDS.contains(sort) ? sort : "tradedAt";
        Sort.Direction direction = "ASC".equalsIgnoreCase(order) ? Sort.Direction.ASC : Sort.Direction.DESC;

        Long fromEpoch = parseFromDate(from);
        Long toEpoch   = parseToDate(to);

        Specification<BinanceTrade> spec = buildSpec(symbol, marketType, fromEpoch, toEpoch);
        Pageable pageable = PageRequest.of(safePage, safeSize, Sort.by(direction, sortField));

        Page<BinanceTrade> result = repository.findAll(spec, pageable);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("content", result.getContent().stream().map(BinanceTradeDto::from).toList());
        response.put("totalElements", result.getTotalElements());
        response.put("totalPages", result.getTotalPages());
        response.put("page", safePage);
        response.put("size", safeSize);
        return response;
    }

    private Specification<BinanceTrade> buildSpec(String symbol, String marketType, Long from, Long to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (symbol != null && !symbol.isBlank()) {
                predicates.add(cb.equal(root.get("symbol"), symbol.toUpperCase()));
            }
            if (marketType != null && !marketType.isBlank()) {
                String mt = marketType.toUpperCase();
                if ("SPOT".equals(mt) || "FUTURES".equals(mt)) {
                    predicates.add(cb.equal(root.get("marketType"), mt));
                }
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("tradedAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("tradedAt"), to));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    /** yyyy-MM-dd → KST 하루 시작 epoch ms */
    private Long parseFromDate(String date) {
        if (date == null || date.isBlank()) return null;
        try {
            ZonedDateTime zdt = LocalDate.parse(date).atStartOfDay(KST);
            return zdt.toInstant().toEpochMilli();
        } catch (Exception e) {
            return null;
        }
    }

    /** yyyy-MM-dd → KST 하루 끝 epoch ms */
    private Long parseToDate(String date) {
        if (date == null || date.isBlank()) return null;
        try {
            ZonedDateTime zdt = LocalDate.parse(date).atTime(23, 59, 59, 999_000_000).atZone(KST);
            return zdt.toInstant().toEpochMilli();
        } catch (Exception e) {
            return null;
        }
    }
}
