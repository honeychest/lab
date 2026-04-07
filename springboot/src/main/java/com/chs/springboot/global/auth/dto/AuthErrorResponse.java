// [AGENT] 인증 에러 응답 DTO — message와 errorCode를 JSON 본문으로 전달
package com.chs.springboot.global.auth.dto;

import lombok.Getter;

@Getter
public class AuthErrorResponse {
    private String message;
    private String errorCode;
    public AuthErrorResponse(String message, String errorCode) {
        this.message = message;
        this.errorCode = errorCode;
    }
}
