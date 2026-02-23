package com.chs.springboot.domain.weather.controller;

import com.chs.springboot.domain.weather.repository.WeatherRepository;
import com.chs.springboot.domain.weather.service.WeatherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/weather")
@CrossOrigin(origins = "*")
public class WeatherController {

    @Autowired
    private WeatherService weatherService;

    @Autowired
    private WeatherRepository weatherRepository;

    /**
     * DB에 저장된 오늘의 시간대 목록을 반환합니다.
     * 예) [0, 1, 2, ... 14]
     */
    @GetMapping("/available-hours")
    public List<Integer> getAvailableHours() {
        List<Integer> hours = weatherRepository.findDistinctHours();
        System.out.println("Available hours: " + hours);
        return hours;
    }

    /**
     * 전국 10개 지역의 날씨 데이터를 반환합니다.
     * hour 파라미터가 없으면 현재 시각 기준으로 조회합니다.
     */
    @GetMapping("/all")
    public Map<String, Map<String, String>> getAllWeather(
            @RequestParam(required = false) Integer hour) {
        return weatherService.getWeatherByHour(hour);
    }
}