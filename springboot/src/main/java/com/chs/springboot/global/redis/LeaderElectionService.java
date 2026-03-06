// [AGENT] global/redis/LeaderElectionService.java
// 역할: Redis를 이용한 리더 선출 (텔레그램 폴링 단일 서버 실행 보장)
// - refreshLeadership(): 5초마다 Redis SETNX로 리더 획득/유지, TTL=10s
// - LEADER_KEY="telegram:leader", SERVER_NAME env로 서버 식별
// - isLeader(): 현재 서버가 리더인지 반환
// 연관: TelegramPollingService, StringRedisTemplate
package com.chs.springboot.global.redis;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Slf4j
@Service
@RequiredArgsConstructor
public class LeaderElectionService {

    private static final String LEADER_KEY = "telegram:leader";
    private static final Duration TTL = Duration.ofSeconds(10);

    private final StringRedisTemplate redisTemplate;

    @Value("${SERVER_NAME:LOCAL}")
    private String serverName;

    private volatile boolean isLeader = false;

    /**
     * 5초마다 리더 상태 갱신/획득 시도
     */
    @Scheduled(fixedRate = 5000)
    public void refreshLeadership() {
        try {
            if (isLeader) {
                // 이미 리더면 TTL 연장
                Boolean success = redisTemplate.expire(LEADER_KEY, TTL);
                if (Boolean.FALSE.equals(success)) {
                    // 키가 사라졌으면 다시 획득 시도
                    tryAcquire();
                }
            } else {
                tryAcquire();
            }
        } catch (Exception e) {
            log.error("Leader election error: {}", e.getMessage());
            isLeader = false;
        }
    }

    private void tryAcquire() {
        Boolean acquired = redisTemplate.opsForValue()
                .setIfAbsent(LEADER_KEY, serverName, TTL);

        if (Boolean.TRUE.equals(acquired)) {
            isLeader = true;
            log.info("[{}] 리더 획득", serverName);
        } else {
            String currentLeader = redisTemplate.opsForValue().get(LEADER_KEY);
            isLeader = serverName.equals(currentLeader);
        }
    }

    public boolean isLeader() {
        return isLeader;
    }

    public String getServerName() {
        return serverName;
    }
}