// [AGENT] 역할: 날씨 엔티티 JPA Repository | 연관파일: WeatherEntity.java, WeatherService.java, WeatherController.java | 주요메서드: existsByRegionAndFcstDateTime(), findByRegionAndFcstDateTime(), findAllByFcstDateTime(), findDistinctHours(LocalDate today) — today 파라미터로 DB UTC 타임존 버그 방지
package com.chs.springboot.domain.weather.repository;

import com.chs.springboot.domain.weather.model.WeatherEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface WeatherRepository extends JpaRepository<WeatherEntity, Long> {

    // 특정 지역과 예보 시간의 중복 여부 확인
    boolean existsByRegionAndFcstDateTime(String region, LocalDateTime fcstDateTime);

    // 특정 지역 + 예보 시간의 단건 조회 (retry 전 DB 캐시 확인용)
    Optional<WeatherEntity> findByRegionAndFcstDateTime(String region, LocalDateTime fcstDateTime);

    // 특정 예보 시간에 해당하는 모든 지역 데이터 조회
    @Query("SELECT w FROM WeatherEntity w WHERE w.fcstDateTime = :targetTime")
    List<WeatherEntity> findAllByFcstDateTime(@Param("targetTime") LocalDateTime targetTime);

    // DB에 저장된 오늘(KST 기준) 고유 시간대 목록 조회
    // today 파라미터: 컨트롤러에서 KST 기준으로 계산한 LocalDate를 전달받음.
    // CURRENT_DATE 대신 파라미터로 받는 이유:
    //   DB 서버는 UTC 기준이라 CURRENT_DATE가 KST 자정 이후에도 어제 날짜를 반환함.
    //   예) 새벽 1시 KST → DB CURRENT_DATE = 어제(UTC) → 어제 데이터까지 포함되는 버그.
    //   Java 앱 서버(KST)에서 오늘 날짜를 계산해 넘기면 DB 타임존 영향을 받지 않음.
    @Query("SELECT DISTINCT HOUR(w.fcstDateTime) FROM WeatherEntity w " +
            "WHERE DATE(w.fcstDateTime) = :today " +
            "ORDER BY HOUR(w.fcstDateTime)")
    List<Integer> findDistinctHours(@Param("today") LocalDate today);
}