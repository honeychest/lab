// [AGENT] 역할: SignalParams JPA Repository | 연관파일: SignalParams.java, SignalDataService.java
package com.chs.springboot.domain.binance.repository;

import com.chs.springboot.domain.binance.model.SignalParams;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SignalParamsRepository extends JpaRepository<SignalParams, String> {
}
