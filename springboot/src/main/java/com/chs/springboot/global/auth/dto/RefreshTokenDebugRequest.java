// [AGENT] refresh token 디버그 요청 DTO — 테스트 페이지에서 Redis 조회용 refreshToken을 전달
package com.chs.springboot.global.auth.dto;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RefreshTokenDebugRequest {
    private String refreshToken;

    public RefreshTokenDebugRequest() {
    }

    public RefreshTokenDebugRequest(String refreshToken) {
        this.refreshToken = refreshToken;
    }
}
