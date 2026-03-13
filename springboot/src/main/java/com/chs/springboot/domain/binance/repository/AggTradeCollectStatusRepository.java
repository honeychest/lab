// [AGENT] 역할: AggTradeCollectStatus JPA Repository | 연관파일: AggTradeCollectStatus.java, AggTradeStorageService.java, AggTradeBackfillService.java
// 주요메서드: findBySymbolAndMarketType (심볼+마켓별 수집 상태 조회)
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.AggTradeCollectStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AggTradeCollectStatusRepository extends JpaRepository<AggTradeCollectStatus, Long> {

    Optional<AggTradeCollectStatus> findBySymbolAndMarketType(String symbol, String marketType);

    List<AggTradeCollectStatus> findByEnabledTrue();
}

