package com.chs.springboot.external;

import com.chs.springboot.domain.weather.service.WeatherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
public class WeatherScheduler {

    @Autowired
    private WeatherService weatherService;

    /**
     * 매 10분마다 전국 날씨 데이터를 자동 수집합니다.
     * 현재 시각 기준(hour=null)으로 Service를 호출합니다.
     */
    @Scheduled(cron = "0 */10 * * * *")
    public void collectWeatherData() {
        // DotenvConfig가 @PostConstruct에서 로드하므로, application.properties 평가 시점보다
        // 늦게 값이 세팅됨. 따라서 런타임에 시스템 프로퍼티를 직접 확인한다.
        if (!"true".equalsIgnoreCase(System.getProperty("SCHEDULING_ENABLED"))) {
            return;
        }
        System.out.println("--- [스케줄러] 10분 주기 자동 수집 시작: " + LocalDateTime.now() + " ---");
        try {
            weatherService.getWeatherByHour(null);
            System.out.println("--- [스케줄러] 수집 완료 ---");
        } catch (Exception e) {
            System.err.println("--- [스케줄러] 에러: " + e.getMessage() + " ---");
        }
    }
}