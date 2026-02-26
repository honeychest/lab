// Purpose: 날씨 데이터 조회 서비스 — DB 우선 조회 후 부족 시 기상청 API 호출 + DB 저장

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할
 * ─────────────────────────────────────────────────────────────────
 *  전국 10개 시도의 날씨 데이터를 제공하는 핵심 서비스.
 *
 *  전략: DB 우선(Cache-First) 패턴
 *    1. 먼저 DB를 조회해서 데이터가 있으면 즉시 반환 (빠름, API 호출 불필요)
 *    2. 없거나 부족하면 기상청 API를 호출해서 받아오고 DB에 저장
 *    3. API 실패 시 1시간 전 데이터로 재시도 (최대 5회 재귀 호출)
 *
 *  호출하는 곳:
 *    - WeatherController: 프론트엔드의 GET /api/weather/all?hour=N 요청
 *    - WeatherScheduler: 10분마다 자동 수집 (SCHEDULING_ENABLED=true 시)
 *
 *  기상청 API 개요:
 *    단기예보 조회 API (초단기실황 → 현재 시각 기준 실황 데이터)
 *    파라미터: base_date(날짜), base_time(시각), nx(격자X), ny(격자Y)
 *    응답: JSON 배열, category(항목코드) + fcstValue(값) 형태
 *
 *  jQuery 비유:
 *    $.ajax 전에 localStorage를 먼저 확인하고, 없으면 서버에 요청하는 캐시 패턴.
 *    단, 여기서는 localStorage 대신 MySQL DB를 사용.
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.domain.weather.service;

import com.chs.springboot.domain.weather.model.WeatherEntity;
import com.chs.springboot.domain.weather.repository.WeatherRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class WeatherService {

    /**
     * serviceKey: 기상청 API 인증 키.
     * .env 파일에서 WEATHER_API_SERVICE_KEY 값을 읽어 주입.
     * URL에 포함해 인증에 사용 (?serviceKey=...)
     */
    @Value("${WEATHER_API_SERVICE_KEY}")
    private String serviceKey;

    /**
     * baseUrl: 기상청 API 기본 URL.
     * 예: https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst
     */
    @Value("${WEATHER_API_BASE_URL}")
    private String baseUrl;

    /**
     * weatherRepository: DB 조회/저장 담당 (JPA Repository).
     * @Autowired = Spring이 WeatherRepository 빈을 자동 주입.
     */
    @Autowired
    private WeatherRepository weatherRepository;

    /**
     * restTemplate: 기상청 REST API를 호출하는 HTTP 클라이언트.
     *
     * 왜 필드로 선언하나? (싱글턴 패턴)
     *   기상청 API를 10개 지역 × 재시도 횟수만큼 호출하므로
     *   매 호출마다 new RestTemplate()을 만들면 불필요한 객체 생성 반복.
     *   한 번만 생성해서 재사용 → 성능 및 메모리 효율 향상.
     *
     *   jQuery 비유: 매번 $.ajax()를 직접 호출하는 대신
     *   공통 설정을 $.ajaxSetup()으로 잡아두고 재사용하는 것과 유사.
     */
    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * locations: 전국 10개 시도별 기상청 격자 좌표(nx, ny).
     *
     * 기상청 격자 좌표계:
     *   기상청은 전국을 격자로 나눠서 각 격자에 날씨 데이터를 제공.
     *   nx(격자 X), ny(격자 Y)는 경위도 좌표와 다름.
     *   각 시도의 중심 격자 좌표를 사전에 조회해서 하드코딩.
     *
     * LinkedHashMap:
     *   삽입 순서가 보장되는 Map.
     *   forEach로 순회할 때 항상 같은 순서로 처리됨.
     *   jQuery: var locations = {}; 에 순서 없이 넣는 것과 달리 순서 보장.
     */
    private final Map<String, int[]> locations = new LinkedHashMap<>();

    /**
     * 생성자: locations 맵에 10개 시도 격자 좌표 등록.
     * Spring이 WeatherService 빈을 생성할 때 이 생성자가 실행됨.
     * {nx, ny} = 기상청 격자 X, Y 좌표.
     */
    public WeatherService() {
        locations.put("서울특별시",    new int[]{60, 127});
        locations.put("경기도",        new int[]{60, 120});
        locations.put("강원도",        new int[]{73, 134});
        locations.put("충청북도",      new int[]{69, 107});
        locations.put("충청남도",      new int[]{68, 100});
        locations.put("전라북도",      new int[]{63,  89});
        locations.put("경상북도",      new int[]{89,  91});
        locations.put("전라남도",      new int[]{51,  67});
        locations.put("경상남도",      new int[]{91,  77});
        locations.put("제주특별자치도", new int[]{52,  38});
    }

    /**
     * getLocations: 격자 좌표 맵 반환.
     * 현재는 WeatherController 또는 Scheduler에서 직접 사용하지 않으나
     * 필요 시 외부에서 지역 목록을 참조할 수 있도록 public으로 공개.
     */
    public Map<String, int[]> getLocations() {
        return locations;
    }

    /**
     * getWeatherByHour: 특정 시간대의 전국 날씨 데이터 반환.
     *
     * @param hour 조회할 시간 (0~23). null이면 현재 시각 기준.
     * @return 지역명 → 날씨 데이터 맵
     *   예: { "서울특별시": { "tmp": "5", "hum": "60", "wind": "2.0", "rain": "0" }, ... }
     *
     * 처리 순서:
     *   [1] targetHour 계산 (null이면 현재시, 미래 시간이면 어제 데이터로)
     *   [2] DB에서 해당 시간 데이터 조회
     *   [3] 10개 지역 모두 있으면 즉시 반환
     *   [4] 부족한 지역만 기상청 API 호출 → DB 저장
     *
     * DB 서버 UTC / 앱 서버 KST 혼용 주의:
     *   LocalDateTime.now()는 앱 서버의 시스템 타임존(KST) 기준.
     *   DB 저장 시 UTC로 변환되지 않으므로 타임존 혼용에 주의.
     */
    public Map<String, Map<String, String>> getWeatherByHour(Integer hour) {
        Map<String, Map<String, String>> results = new HashMap<>();
        LocalDateTime now = LocalDateTime.now(); // 현재 시각 (KST)

        // ── targetHour 결정 ──────────────────────────────────────
        LocalDateTime targetHour;
        if (hour == null) {
            // 현재 시각의 정각 (분·초·나노초 = 0)
            // 예: 현재 14:37:23 → targetHour = 14:00:00
            targetHour = now.withMinute(0).withSecond(0).withNano(0);
        } else {
            // 오늘 해당 시각의 정각 생성
            LocalDateTime candidate = now.withHour(hour).withMinute(0).withSecond(0).withNano(0);
            // 요청한 시간이 현재보다 미래이면 (예: 현재 14시인데 hour=22 요청)
            // → 어제 22시 데이터로 조회 (미래 데이터는 없음)
            targetHour = candidate.isAfter(now) ? candidate.minusDays(1) : candidate;
        }

        // 기상청 API 파라미터로 사용할 시각 문자열: "HH00" 형식
        // 예: targetHour = 14:00:00 → "1400"
        String currentHourStr = targetHour.format(DateTimeFormatter.ofPattern("HH00"));

        // ── [2] DB 조회 ──────────────────────────────────────────
        /**
         * findAllByFcstDateTime(targetHour):
         *   해당 예보 시각과 일치하는 모든 지역 데이터를 DB에서 조회.
         *   JPA Repository 메서드명 규칙: findAllBy + 필드명
         *   → WHERE fcst_date_time = targetHour (JPQL 자동 생성)
         *
         *   jQuery 비유:
         *     $.ajax({ url: '/api/db/weather?hour=' + hour }) 로
         *     서버가 DB 조회 후 반환하는 것과 동일한 역할.
         */
        List<WeatherEntity> entities = weatherRepository.findAllByFcstDateTime(targetHour);

        for (WeatherEntity entity : entities) {
            Map<String, String> data = new HashMap<>();
            data.put("tmp",      entity.getTmp());   // 기온 (°C)
            data.put("hum",      entity.getHum());   // 습도 (%)
            data.put("rain",     entity.getRain());  // 강수량 (mm)
            data.put("wind",     entity.getWind());  // 풍속 (m/s)
            // baseTime: 예보 시각을 "HHmm" 형식으로 변환
            // 예: LocalDateTime 14:00:00 → "1400"
            data.put("baseTime", entity.getFcstDateTime()
                    .format(DateTimeFormatter.ofPattern("HHmm")));
            results.put(entity.getRegion(), data); // 지역명을 키로 저장
        }

        // ── [3] DB 데이터가 충분하면 즉시 반환 ──────────────────
        /**
         * 10개 지역(locations.size() = 10) 모두 DB에 있으면 API 호출 없이 반환.
         * DB 히트율이 높을수록 빠른 응답 + 기상청 API 호출 횟수 절약.
         */
        if (results.size() >= locations.size()) {
            System.out.println("Serving data from DB for hour: " + targetHour.getHour());
            return results;
        }

        // ── [4] 부족한 지역만 API 호출 ──────────────────────────
        System.out.println("Data missing for hour " + targetHour.getHour() + ". Calling API...");

        /**
         * locations.forEach(): 10개 지역을 순서대로 순회.
         * results.containsKey(name): 이미 DB에서 가져온 지역은 스킵.
         * → DB에 없는 지역만 API 호출로 채움.
         *
         * jQuery 비유:
         *   $.each(locations, function(name, coords) {
         *     if (results[name]) return; // 이미 있으면 스킵
         *     $.ajax({ url: 기상청API, success: function(data) { results[name] = data; }});
         *   });
         */
        locations.forEach((name, coords) -> {
            if (results.containsKey(name)) return; // 이미 DB 데이터 있으면 스킵

            // 재귀 호출로 API 조회 (최대 5회 재시도)
            Map<String, String> weatherData = fetchWeatherRecursive(
                    restTemplate, coords, targetHour, currentHourStr, 0);

            if (weatherData == null || weatherData.isEmpty()) return;

            // API 응답의 fcstTime을 baseTime으로 복사 (형식 통일)
            weatherData.put("baseTime", weatherData.get("fcstTime"));
            results.put(name, weatherData);

            // DB에 저장 (중복 저장 방지 포함)
            saveIfAbsent(name, coords, targetHour, weatherData);
        });

        return results;
    }

    /**
     * saveIfAbsent: DB에 해당 지역+시간 데이터가 없을 때만 저장.
     *
     * @param name        지역명 (예: "서울특별시")
     * @param coords      격자 좌표 [nx, ny]
     * @param targetHour  조회 기준 시각 (LocalDateTime)
     * @param weatherData API에서 받아온 날씨 데이터 맵
     *
     * 중복 저장 방지:
     *   existsByRegionAndFcstDateTime(): 해당 지역+시각 데이터가 이미 있는지 확인.
     *   같은 데이터가 여러 번 저장되지 않도록 방어.
     *   DB 테이블에 Unique Constraint (region, fcst_date_time)이 있으므로
     *   중복 삽입 시 DB 오류가 발생할 수 있어 사전 체크 필요.
     *
     * fcstDate + fcstTime → LocalDateTime 파싱:
     *   기상청 API 응답: fcstDate="20240226", fcstTime="1400"
     *   → "20240226" + "1400" = "202402261400"
     *   → DateTimeFormatter "yyyyMMddHHmm" 으로 파싱
     *   → LocalDateTime 2024-02-26T14:00:00
     *
     * try-catch:
     *   저장 실패 시 전체 응답이 중단되지 않도록 에러만 출력하고 계속 진행.
     */
    private void saveIfAbsent(String name, int[] coords,
                              LocalDateTime targetHour, Map<String, String> weatherData) {
        try {
            String fDate = weatherData.get("fcstDate"); // "20240226"
            String fTime = weatherData.get("fcstTime"); // "1400"
            LocalDateTime fcstDT = LocalDateTime.parse(
                    fDate + fTime, DateTimeFormatter.ofPattern("yyyyMMddHHmm"));

            // 예보 시각의 시(hour)가 targetHour의 시(hour)와 일치하는지 확인
            // (재시도로 이전 시간 데이터를 받아온 경우 저장하지 않음)
            if (fcstDT.getHour() == targetHour.getHour()
                    && !weatherRepository.existsByRegionAndFcstDateTime(name, fcstDT)) {

                WeatherEntity entity = new WeatherEntity();
                entity.setRegion(name);
                entity.setNx(String.valueOf(coords[0]));
                entity.setNy(String.valueOf(coords[1]));
                entity.setFcstDateTime(fcstDT);
                entity.setTmp(weatherData.get("tmp"));
                entity.setHum(weatherData.get("hum"));
                entity.setRain(weatherData.get("rain"));
                entity.setWind(weatherData.get("wind"));
                weatherRepository.save(entity); // JPA save: INSERT 실행
                System.out.println("Saved: " + name + " at " + fcstDT);
            }
        } catch (Exception e) {
            System.err.println("Save error: " + e.getMessage());
        }
    }

    /**
     * fetchWeatherRecursive: 기상청 API를 재귀 호출해 날씨 데이터를 가져옴.
     *
     * @param restTemplate HTTP 클라이언트 (필드에서 전달)
     * @param coords       격자 좌표 [nx, ny]
     * @param dateTime     조회 기준 시각 (실패 시 minusHours(1)로 줄어듦)
     * @param currentHour  목표 시각 문자열 "HH00" (예: "1400")
     * @param retryCount   현재 재시도 횟수
     * @return 날씨 데이터 맵. 5회 모두 실패 시 빈 맵 반환.
     *
     * 재시도 전략:
     *   기상청 API는 base_time 기준으로 데이터를 제공하는데,
     *   매 정시 직후에는 데이터가 아직 없는 경우가 있음 (수분 지연).
     *   1시간 전 데이터로 재시도하면 보통 데이터가 있음.
     *
     *   최대 5회 재시도 = 최대 4시간 전 데이터까지 허용.
     *   retryCount >= 5이면 빈 맵 반환 → 해당 지역 데이터 없음으로 처리.
     *
     * URL 구성 예시:
     *   {baseUrl}?serviceKey={key}&pageNo=1&numOfRows=1000
     *   &dataType=JSON&base_date=20240226&base_time=1400&nx=60&ny=127
     *   numOfRows=1000: 한 번에 최대 1000개 항목 수신 (전체 데이터를 한 번에)
     *
     * restTemplate.getForObject(url, String.class):
     *   HTTP GET 요청 후 응답 본문을 String으로 반환.
     *   jQuery: $.ajax({ method: 'GET', url: url, dataType: 'text' }) 와 동일.
     *
     * Thread.sleep(200):
     *   연속 API 호출 사이에 200ms 대기.
     *   기상청 API Rate Limit 방어 + 서버 부하 감소.
     *   InterruptedException: sleep 중 스레드가 인터럽트되면 발생.
     *   interrupt() 재설정: Java 스레드 인터럽트 정책에 따라 플래그를 복원.
     */
    private Map<String, String> fetchWeatherRecursive(RestTemplate restTemplate,
                                                      int[] coords,
                                                      LocalDateTime dateTime,
                                                      String currentHour,
                                                      int retryCount) {
        if (retryCount >= 5) return new HashMap<>(); // 최대 5회 재시도 초과 → 포기

        // 기상청 API 파라미터 포맷팅
        String baseDate = dateTime.format(DateTimeFormatter.ofPattern("yyyyMMdd")); // "20240226"
        String baseTime = dateTime.format(DateTimeFormatter.ofPattern("HHmm"));     // "1400"

        // URL 조합: String.format()은 printf처럼 %s, %d 자리에 값 삽입
        String url = String.format(
                "%s?serviceKey=%s&pageNo=1&numOfRows=1000&dataType=JSON" +
                        "&base_date=%s&base_time=%s&nx=%d&ny=%d",
                baseUrl, serviceKey, baseDate, baseTime, coords[0], coords[1]);

        try {
            // 기상청 API 호출 → JSON 문자열 반환
            String json = restTemplate.getForObject(url, String.class);
            // JSON 파싱 → 목표 시각(currentHour)의 날씨 항목 추출
            Map<String, String> data = extractFcstData(json, currentHour);
            if (!data.isEmpty()) return data; // 데이터 있으면 반환
        } catch (Exception e) {
            System.err.println("API call error: " + e.getMessage());
        }

        // 연속 호출 방지 딜레이 (200ms)
        try {
            Thread.sleep(200);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt(); // 인터럽트 플래그 복원
        }

        // 1시간 전 데이터로 재시도 (dateTime.minusHours(1))
        // retryCount + 1로 카운터 증가
        return fetchWeatherRecursive(
                restTemplate, coords, dateTime.minusHours(1), currentHour, retryCount + 1);
    }

    /**
     * extractFcstData: 기상청 API 응답 JSON을 파싱해서 날씨 데이터 추출.
     *
     * @param json        기상청 API 응답 원본 JSON 문자열
     * @param currentHour 목표 시각 "HH00" (예: "1400")
     * @return 날씨 데이터 맵 { tmp, hum, rain, wind, fcstDate, fcstTime }
     *
     * 기상청 API 응답 구조:
     *   {
     *     "response": {
     *       "body": {
     *         "items": {
     *           "item": [
     *             { "category": "T1H", "fcstDate": "20240226", "fcstTime": "1400", "fcstValue": "5" },
     *             { "category": "REH", "fcstDate": "20240226", "fcstTime": "1400", "fcstValue": "60" },
     *             ...
     *           ]
     *         }
     *       }
     *     }
     *   }
     *
     * category 코드:
     *   T1H = 기온 (°C)
     *   REH = 습도 (%)
     *   RN1 = 1시간 강수량 (mm)
     *   WSD = 풍속 (m/s)
     *   (그 외 PTY=강수형태, SKY=하늘상태 등 여러 코드가 있으나 4개만 사용)
     *
     * ObjectMapper (Jackson 라이브러리):
     *   JSON 문자열 → Java 객체 변환.
     *   jQuery: JSON.parse(str) 또는 $.parseJSON(str) 과 동일한 역할.
     *
     * .path("key"):
     *   JsonNode에서 특정 키의 값을 안전하게 읽음.
     *   키가 없으면 MissingNode 반환 (null 대신) → NullPointerException 방지.
     *
     * switch (category):
     *   Java 14+ 향상된 switch 문법 (-> 화살표 사용).
     *   category 값에 따라 적절한 키로 data 맵에 저장.
     */
    private Map<String, String> extractFcstData(String json, String currentHour) {
        Map<String, String> data = new HashMap<>();
        try {
            ObjectMapper mapper = new ObjectMapper();
            // 중첩된 JSON 경로 탐색: response.body.items.item 배열
            JsonNode items = mapper.readTree(json)
                    .path("response").path("body").path("items").path("item");

            if (!items.isArray()) return data; // item이 배열이 아니면 빈 맵 반환

            for (JsonNode item : items) {
                // currentHour("1400")과 일치하는 시각의 데이터만 처리
                // 기상청 응답에는 여러 시각의 데이터가 섞여있음
                if (!currentHour.equals(item.path("fcstTime").asText())) continue;

                // 예보 날짜/시각 저장 (DB 저장 시 필요)
                data.put("fcstDate", item.path("fcstDate").asText()); // "20240226"
                data.put("fcstTime", item.path("fcstTime").asText()); // "1400"

                // category 코드에 따라 적절한 키로 값 저장
                switch (item.path("category").asText()) {
                    case "T1H" -> data.put("tmp",  item.path("fcstValue").asText()); // 기온
                    case "REH" -> data.put("hum",  item.path("fcstValue").asText()); // 습도
                    case "RN1" -> data.put("rain", item.path("fcstValue").asText()); // 강수량
                    case "WSD" -> data.put("wind", item.path("fcstValue").asText()); // 풍속
                }
            }
        } catch (Exception e) {
            System.err.println("Parsing error: " + e.getMessage());
        }
        return data;
    }
}
