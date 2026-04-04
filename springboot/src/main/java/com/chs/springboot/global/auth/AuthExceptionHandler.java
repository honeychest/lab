// [AGENT] 인증 예외 핸들러 — 로그인 실패 IllegalArgumentException을 401 JSON 응답으로 변환
package com.chs.springboot.global.auth;

import com.chs.springboot.global.auth.dto.AuthErrorResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

    /*  IllegalArgumentException 발생
      -> message 꺼냄
      -> AuthErrorResponse body 생성
      -> HTTP 401로 설정해서 반환*/
@RestControllerAdvice // 컨트롤러 전역 예외처리 + JSON 응답.
@Slf4j
public class AuthExceptionHandler {
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<AuthErrorResponse> ExceptionHandler(IllegalArgumentException e){
        log.warn("[Auth] login failed message={}", e.getMessage());
        // AuthErrorResponse가 담당하는 것은 본문(JSON 내용) 을 정의하는 객체 (body 내용만 전달)
        AuthErrorResponse authErrorResponse = new AuthErrorResponse(e.getMessage(), "AUTH_LOGIN_FAILED");
        // ResponseEntity가 담당하는 것은 HTTP 응답 전체를 제어하는 도구입니다. (status, header, body)
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(authErrorResponse);
    }
}
