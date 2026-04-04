// [AGENT] access token 디버그 응답 DTO — 유효 여부와 claims/만료시각을 테스트 페이지에 반환
package com.chs.springboot.global.auth.dto;

import lombok.Getter;

import java.util.List;

@Getter
public class AccessTokenDebugResponse {
    private final Boolean valid;
    private final String message;
    private final String subject;
    private final String email;
    private final List<String> permissionCodes;
    private final String issuedAt;
    private final String expiresAt;

    public AccessTokenDebugResponse(Boolean valid,
                                    String message,
                                    String subject,
                                    String email,
                                    List<String> permissionCodes,
                                    String issuedAt,
                                    String expiresAt) {
        this.valid = valid;
        this.message = message;
        this.subject = subject;
        this.email = email;
        this.permissionCodes = permissionCodes;
        this.issuedAt = issuedAt;
        this.expiresAt = expiresAt;
    }
}
