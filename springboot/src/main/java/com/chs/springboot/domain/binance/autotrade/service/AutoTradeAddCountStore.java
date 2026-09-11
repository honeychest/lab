package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradeSide;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class AutoTradeAddCountStore {

    private static final String PREFIX = "state:binance:autotrade:add-count:";

    private final StringRedisTemplate redisTemplate;
    private final ConcurrentHashMap<String, Integer> memory = new ConcurrentHashMap<>();

    public int get(String symbol, AutoTradeSide side) {
        String key = key(symbol, side);
        try {
            String value = redisTemplate.opsForValue().get(key);
            if (value != null) {
                int count = Integer.parseInt(value);
                memory.put(key, count);
                return Math.max(count, 0);
            }
        } catch (Exception e) {
            log.warn("[AutoTrade] 추가 진입 횟수 Redis 조회 실패: {}", e.getMessage());
        }
        return memory.getOrDefault(key, 0);
    }

    public void set(String symbol, AutoTradeSide side, int count) {
        String key = key(symbol, side);
        memory.put(key, count);
        try {
            redisTemplate.opsForValue().set(key, String.valueOf(count));
        } catch (Exception e) {
            log.warn("[AutoTrade] 추가 진입 횟수 Redis 저장 실패: {}", e.getMessage());
        }
    }

    public void delete(String symbol, AutoTradeSide side) {
        String key = key(symbol, side);
        memory.remove(key);
        try {
            redisTemplate.delete(key);
        } catch (Exception e) {
            log.warn("[AutoTrade] 추가 진입 횟수 Redis 삭제 실패: {}", e.getMessage());
        }
    }

    private String key(String symbol, AutoTradeSide side) {
        return PREFIX + symbol.toUpperCase() + ":" + side.name();
    }
}
