// [AGENT] refresh token 디버그 응답 DTO — Redis key/value/ttlSeconds 존재 여부를 테스트 페이지에 반환
package com.chs.springboot.global.auth.dto;

import lombok.Getter;

@Getter
public class RefreshTokenDebugResponse {
    private final String redisKey;
    private final String userId;
    private final Long ttlSeconds;
    private final Boolean exists;

    public RefreshTokenDebugResponse(String redisKey, String userId, Long ttlSeconds, Boolean exists) {
        this.redisKey = redisKey;
        this.userId = userId;
        this.ttlSeconds = ttlSeconds;
        this.exists = exists;
    }
}
