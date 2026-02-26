// Purpose: 날씨 REST API 엔드포인트 — 사용 가능 시간 목록 및 전국 날씨 데이터 제공

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할
 * ─────────────────────────────────────────────────────────────────
 *  프론트엔드(useWeatherData.ts)의 날씨 API 요청을 받아 응답하는 진입점.
 *
 *  엔드포인트:
 *    GET /api/weather/available-hours → DB에 저장된 시간 목록 (예: [0, 3, 6, 12])
 *    GET /api/weather/all?hour=N      → 전국 10개 시도 날씨 데이터
 *
 *  프론트엔드 흐름 (useWeatherData.ts):
 *    1. fetch('/api/weather/available-hours') → 선택 가능 시간 목록 조회
 *    2. fetch('/api/weather/all?hour=14')     → 14시 전국 날씨 조회
 *    3. 사용자가 시간 선택 시 2번 반복
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.weather.controller;

import com.chs.springboot.domain.weather.repository.WeatherRepository;
import com.chs.springboot.domain.weather.service.WeatherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * @RestController: @Controller + @ResponseBody 합성.
 *   반환값이 자동으로 JSON HTTP 응답으로 직렬화됨.
 *   List<Integer> → JSON 배열 [0, 3, 6, ...]
 *   Map<String, Map<...>> → JSON 중첩 객체 { "서울": { "tmp": "5" }, ... }
 *
 * @RequestMapping("/api/weather"): 이 컨트롤러의 모든 URL 앞에 /api/weather 붙음.
 *
 * @CrossOrigin(origins = "*"):
 *   모든 도메인에서의 CORS(Cross-Origin) 요청 허용.
 *   개발 환경: 프론트(5173) → 백엔드(8080) 다른 포트 → CORS 헤더 필요.
 *   SecurityConfig에서 전체 허용하고 있으므로 중복이지만, 명시적으로 표기.
 *   jQuery: $.ajax에서 crossDomain: true 설정과 유사한 개념(서버측 설정).
 */
@RestController
@RequestMapping("/api/weather")
@CrossOrigin(origins = "*")
public class WeatherController {

    /**
     * weatherService: 날씨 데이터 조회 + API 호출 로직 담당.
     * @Autowired: Spring이 WeatherService 빈을 자동 주입.
     */
    @Autowired
    private WeatherService weatherService;

    /**
     * weatherRepository: DB 직접 조회 (사용 가능 시간 목록용).
     * Controller에서 Repository를 직접 사용하는 것은 일반적으로 지양하나,
     * 단순 조회라서 Service를 거치지 않고 직접 사용.
     */
    @Autowired
    private WeatherRepository weatherRepository;

    /**
     * getAvailableHours: DB에 저장된 오늘의 시간대 목록 반환.
     *
     * @GetMapping("/available-hours"):
     *   GET /api/weather/available-hours 요청 처리.
     *   프론트 useWeatherData.ts에서 fetch('/api/weather/available-hours') 로 호출.
     *
     * @return List<Integer> → JSON 배열로 직렬화.
     *   예: [0, 3, 6, 9, 12, 14] = 오늘 DB에 저장된 시간대 목록.
     *   스케줄러가 10분마다 데이터를 수집하므로 시간이 지날수록 목록이 늘어남.
     *
     * findDistinctHours():
     *   WeatherRepository에 정의된 커스텀 JPQL 쿼리.
     *   오늘 날짜 기준으로 저장된 고유 시간(hour) 목록을 오름차순 반환.
     *   SELECT DISTINCT HOUR(fcst_date_time) FROM weather_history
     *   WHERE DATE(fcst_date_time) = CURDATE() ORDER BY 1
     */
    @GetMapping("/available-hours")
    public List<Integer> getAvailableHours() {
        List<Integer> hours = weatherRepository.findDistinctHours();
        System.out.println("Available hours: " + hours);
        return hours;
    }

    /**
     * getAllWeather: 전국 10개 시도의 날씨 데이터 반환.
     *
     * @GetMapping("/all"):
     *   GET /api/weather/all?hour=14 요청 처리.
     *   프론트에서 fetch('/api/weather/all?hour=14') 로 호출.
     *
     * @RequestParam(required = false) Integer hour:
     *   URL 쿼리 파라미터 ?hour=N 을 Integer로 받음.
     *   required = false: 파라미터 없어도 됨 → hour = null → 현재 시각 기준 조회.
     *   jQuery: $.ajax({ url: '/api/weather/all', data: { hour: 14 } }) 처럼
     *   파라미터를 전달하면 이 메서드가 받음.
     *
     * @return Map<String, Map<String, String>> → JSON 중첩 객체로 직렬화.
     *   예:
     *   {
     *     "서울특별시": { "tmp": "5", "hum": "60", "wind": "2.0", "rain": "0", "baseTime": "1400" },
     *     "경기도":     { "tmp": "3", ... },
     *     ...
     *   }
     *   프론트 useWeatherData.ts에서 GEO_ORDER 순서로 재정렬해서 사용.
     */
    @GetMapping("/all")
    public Map<String, Map<String, String>> getAllWeather(
            @RequestParam(required = false) Integer hour) {
        return weatherService.getWeatherByHour(hour);
    }
}
