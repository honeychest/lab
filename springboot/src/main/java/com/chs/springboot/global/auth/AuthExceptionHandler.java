// [AGENT] 인증 예외 핸들러 — AuthException만 처리 (다른 도메인 IllegalArgumentException과 분리)
package com.chs.springboot.global.auth;

import com.chs.springboot.global.auth.controller.AuthController;
import com.chs.springboot.global.auth.dto.AuthErrorResponse;
import com.chs.springboot.global.auth.exception.AuthException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = { AuthController.class })
@Slf4j
public class AuthExceptionHandler {

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<AuthErrorResponse> handleAuthException(AuthException e) {
        log.warn("[Auth] error code={} status={} message={}", e.getErrorCode(), e.getHttpStatus(), e.getMessage());
        AuthErrorResponse body = new AuthErrorResponse(e.getMessage(), e.getErrorCode());
        return ResponseEntity.status(e.getHttpStatus()).body(body);
    }
}
