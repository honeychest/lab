package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.AggTradeCollectStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AggTradeCollectStatusRepository extends JpaRepository<AggTradeCollectStatus, Long> {

    Optional<AggTradeCollectStatus> findBySymbolAndMarketType(String symbol, String marketType);
}

