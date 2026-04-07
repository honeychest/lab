// [AGENT] 쿠키 디버그 응답 DTO — httpOnly 쿠키에서 읽은 accessToken/refreshToken 정보를 테스트 페이지에 반환
package com.chs.springboot.global.auth.dto;

import lombok.Getter;

import java.util.List;

@Getter
public class CookieDebugResponse {
    private final AccessInfo access;   // accessToken 쿠키 파싱 결과
    private final RefreshInfo refresh; // refreshToken 쿠키 Redis 조회 결과

    public CookieDebugResponse(AccessInfo access, RefreshInfo refresh) {
        this.access = access;
        this.refresh = refresh;
    }

    @Getter
    public static class AccessInfo {
        private final boolean valid;                  // 토큰 유효 여부
        private final String userId;                  // JWT subject (사용자 ID)
        private final List<String> permissionCodes;   // 권한 코드 목록
        private final String issuedAt;                // 발급 시각
        private final String expiresAt;               // 만료 시각

        public AccessInfo(boolean valid, String userId, List<String> permissionCodes, String issuedAt, String expiresAt) {
            this.valid = valid;
            this.userId = userId;
            this.permissionCodes = permissionCodes;
            this.issuedAt = issuedAt;
            this.expiresAt = expiresAt;
        }
    }

    @Getter
    public static class RefreshInfo {
        private final boolean stored;    // Redis에 저장 여부
        private final Long ttlSeconds;   // 남은 TTL (초)

        public RefreshInfo(boolean stored, Long ttlSeconds) {
            this.stored = stored;
            this.ttlSeconds = ttlSeconds;
        }
    }
}
