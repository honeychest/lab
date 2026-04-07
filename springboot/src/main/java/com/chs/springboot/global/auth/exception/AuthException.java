// [AGENT] 인증 도메인 전용 예외 — 전역 IllegalArgumentException 매핑과 분리
package com.chs.springboot.global.auth.exception;

import org.springframework.http.HttpStatus;

public class AuthException extends RuntimeException {
    private final String errorCode;
    private final HttpStatus httpStatus;

    public AuthException(String message, String errorCode, HttpStatus httpStatus) {
        super(message);
        this.errorCode = errorCode;
        this.httpStatus = httpStatus;
    }

    public AuthException(String message, String errorCode) {
        this(message, errorCode, HttpStatus.UNAUTHORIZED);
    }

    public String getErrorCode() {
        return errorCode;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}
