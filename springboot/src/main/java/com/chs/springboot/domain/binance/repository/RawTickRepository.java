// [AGENT] 역할: RawTick JPA Repository — 배치 saveAll용 | 연관파일: RawTick.java, RawTickStorageService.java
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.RawTick;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RawTickRepository extends JpaRepository<RawTick, Long> {
}
