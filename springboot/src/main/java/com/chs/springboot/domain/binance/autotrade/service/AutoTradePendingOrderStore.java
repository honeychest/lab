package com.chs.springboot.domain.binance.autotrade.service;

import com.chs.springboot.domain.binance.autotrade.model.AutoTradePendingOrder;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
public class AutoTradePendingOrderStore {

    private static final String PREFIX = "state:binance:autotrade:pending-order:";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, AutoTradePendingOrder> memory = new ConcurrentHashMap<>();

    public AutoTradePendingOrderStore(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public Optional<AutoTradePendingOrder> get(String symbol) {
        String key = key(symbol);
        AutoTradePendingOrder inMemory = memory.get(key);
        if (inMemory != null) {
            return Optional.of(inMemory);
        }
        try {
            String value = redisTemplate.opsForValue().get(key);
            if (value != null) {
                AutoTradePendingOrder pending = objectMapper.readValue(value, AutoTradePendingOrder.class);
                memory.put(key, pending);
                return Optional.of(pending);
            }
        } catch (Exception e) {
            log.warn("[AutoTrade] 대기 주문 Redis 조회 실패: {}", e.getMessage());
        }
        return Optional.ofNullable(memory.get(key));
    }

    public void set(AutoTradePendingOrder pending) {
        String key = key(pending.symbol());
        memory.put(key, pending);
        try {
            redisTemplate.opsForValue().set(key, objectMapper.writeValueAsString(pending));
        } catch (Exception e) {
            log.warn("[AutoTrade] 대기 주문 Redis 저장 실패: {}", e.getMessage());
        }
    }

    public void delete(String symbol) {
        String key = key(symbol);
        memory.remove(key);
        try {
            redisTemplate.delete(key);
        } catch (Exception e) {
            log.warn("[AutoTrade] 대기 주문 Redis 삭제 실패: {}", e.getMessage());
        }
    }

    private String key(String symbol) {
        return PREFIX + symbol.trim().toUpperCase();
    }
}
