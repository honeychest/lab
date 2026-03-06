// [AGENT] 역할: BigTick JPA Repository | 연관파일: BinanceTrade.java, BinanceTradeService.java, BinanceTradeQueryService.java
// 주요메서드: findByIdLessThanOrderByIdDesc (최신순 페이징), JpaSpecificationExecutor (동적 필터)
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.BinanceTrade;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface BinanceTradeRepository extends JpaRepository<BinanceTrade, Long>, JpaSpecificationExecutor<BinanceTrade> {

    /** id 내림차순 페이징 — recent 초기 로드 및 재연결 후 재조회 */
    List<BinanceTrade> findByIdLessThanOrderByIdDesc(Long id, Pageable pageable);
}
