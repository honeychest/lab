// [AGENT] 토큰 응답 DTO — accessToken과 refreshToken을 함께 반환
package com.chs.springboot.global.auth.dto;

import lombok.Getter;

@Getter
public class AuthTokenPair {
    private final String accessToken;
    private final String refreshToken;

    public  AuthTokenPair(String accessToken, String refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
    }
}
