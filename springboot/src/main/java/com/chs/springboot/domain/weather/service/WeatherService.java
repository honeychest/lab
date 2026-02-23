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

    @Value("${WEATHER_API_SERVICE_KEY}")
    private String serviceKey;

    @Value("${WEATHER_API_BASE_URL}")
    private String baseUrl;

    @Autowired
    private WeatherRepository weatherRepository;

    // 전국 10개 지역 좌표 (nx, ny)
    private final Map<String, int[]> locations = new LinkedHashMap<>();

    public WeatherService() {
        locations.put("서울특별시", new int[]{60, 127});
        locations.put("경기도",     new int[]{60, 120});
        locations.put("강원도",     new int[]{73, 134});
        locations.put("충청북도",   new int[]{69, 107});
        locations.put("충청남도",   new int[]{68, 100});
        locations.put("전라북도",   new int[]{63,  89});
        locations.put("경상북도",   new int[]{89,  91});
        locations.put("전라남도",   new int[]{51,  67});
        locations.put("경상남도",   new int[]{91,  77});
        locations.put("제주특별자치도", new int[]{52, 38});
    }

    public Map<String, int[]> getLocations() {
        return locations;
    }

    /**
     * DB 우선 조회 후 부족하면 기상청 API 호출.
     * Controller와 Scheduler 모두 이 메서드를 사용합니다.
     */
    public Map<String, Map<String, String>> getWeatherByHour(Integer hour) {
        Map<String, Map<String, String>> results = new HashMap<>();
        LocalDateTime now = LocalDateTime.now();

        LocalDateTime targetHour;
        if (hour == null) {
            targetHour = now.withMinute(0).withSecond(0).withNano(0);
        } else {
            LocalDateTime candidate = now.withHour(hour).withMinute(0).withSecond(0).withNano(0);
            // 요청한 시간이 현재 시각보다 미래면 → 어제 데이터
            targetHour = candidate.isAfter(now) ? candidate.minusDays(1) : candidate;
        }

        String currentHourStr = targetHour.format(DateTimeFormatter.ofPattern("HH00"));

        // 1. DB 조회
        List<WeatherEntity> entities = weatherRepository.findAllByFcstDateTime(targetHour);
        for (WeatherEntity entity : entities) {
            Map<String, String> data = new HashMap<>();
            data.put("tmp",      entity.getTmp());
            data.put("hum",      entity.getHum());
            data.put("rain",     entity.getRain());
            data.put("wind",     entity.getWind());
            data.put("baseTime", entity.getFcstDateTime()
                    .format(DateTimeFormatter.ofPattern("HHmm")));
            results.put(entity.getRegion(), data);
        }

        // 모든 지역 데이터가 DB에 있으면 즉시 반환
        if (results.size() >= locations.size()) {
            System.out.println("Serving data from DB for hour: " + targetHour.getHour());
            return results;
        }

        // 2. 부족한 지역만 API 호출
        System.out.println("Data missing for hour " + targetHour.getHour() + ". Calling API...");
        RestTemplate restTemplate = new RestTemplate();

        locations.forEach((name, coords) -> {
            if (results.containsKey(name)) return;

            Map<String, String> weatherData = fetchWeatherRecursive(
                    restTemplate, coords, targetHour, currentHourStr, 0);

            if (weatherData == null || weatherData.isEmpty()) return;

            weatherData.put("baseTime", weatherData.get("fcstTime"));
            results.put(name, weatherData);

            // DB 저장
            saveIfAbsent(name, coords, targetHour, weatherData);
        });

        return results;
    }

    /**
     * DB에 해당 지역+시간 데이터가 없을 때만 저장합니다.
     */
    private void saveIfAbsent(String name, int[] coords,
                              LocalDateTime targetHour, Map<String, String> weatherData) {
        try {
            String fDate = weatherData.get("fcstDate");
            String fTime = weatherData.get("fcstTime");
            LocalDateTime fcstDT = LocalDateTime.parse(
                    fDate + fTime, DateTimeFormatter.ofPattern("yyyyMMddHHmm"));

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
                weatherRepository.save(entity);
                System.out.println("Saved: " + name + " at " + fcstDT);
            }
        } catch (Exception e) {
            System.err.println("Save error: " + e.getMessage());
        }
    }

    /**
     * 기상청 API 재귀 호출 (최대 5회, 실패 시 1시간 전 데이터로 재시도).
     */
    private Map<String, String> fetchWeatherRecursive(RestTemplate restTemplate,
                                                      int[] coords,
                                                      LocalDateTime dateTime,
                                                      String currentHour,
                                                      int retryCount) {
        if (retryCount >= 5) return new HashMap<>();

        String baseDate = dateTime.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String baseTime = dateTime.format(DateTimeFormatter.ofPattern("HHmm"));

        String url = String.format(
                "%s?serviceKey=%s&pageNo=1&numOfRows=1000&dataType=JSON" +
                        "&base_date=%s&base_time=%s&nx=%d&ny=%d",
                baseUrl, serviceKey, baseDate, baseTime, coords[0], coords[1]);

        try {
            String json = restTemplate.getForObject(url, String.class);
            Map<String, String> data = extractFcstData(json, currentHour);
            if (!data.isEmpty()) return data;
        } catch (Exception e) {
            System.err.println("API call error: " + e.getMessage());
        }

        return fetchWeatherRecursive(
                restTemplate, coords, dateTime.minusHours(1), currentHour, retryCount + 1);
    }

    /**
     * API 응답 JSON에서 목표 시각의 날씨 항목을 파싱합니다.
     */
    private Map<String, String> extractFcstData(String json, String currentHour) {
        Map<String, String> data = new HashMap<>();
        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode items = mapper.readTree(json)
                    .path("response").path("body").path("items").path("item");

            if (!items.isArray()) return data;

            for (JsonNode item : items) {
                if (!currentHour.equals(item.path("fcstTime").asText())) continue;

                data.put("fcstDate", item.path("fcstDate").asText());
                data.put("fcstTime", item.path("fcstTime").asText());

                switch (item.path("category").asText()) {
                    case "T1H" -> data.put("tmp",  item.path("fcstValue").asText());
                    case "REH" -> data.put("hum",  item.path("fcstValue").asText());
                    case "RN1" -> data.put("rain", item.path("fcstValue").asText());
                    case "WSD" -> data.put("wind", item.path("fcstValue").asText());
                }
            }
        } catch (Exception e) {
            System.err.println("Parsing error: " + e.getMessage());
        }
        return data;
    }
}