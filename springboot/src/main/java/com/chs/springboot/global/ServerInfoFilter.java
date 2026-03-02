// Purpose: 모든 API 응답에 X-Server-Name 헤더를 주입하는 필터 — 컨테이너 식별용

package com.chs.springboot.global;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * ServerInfoFilter
 *
 * 모든 HTTP 요청 처리 후 응답 헤더에 X-Server-Name 을 자동으로 추가한다.
 * 프론트엔드는 API 응답 헤더를 읽어 현재 접속 중인 서버를 식별한다.
 *
 * 식별 방식:
 *   docker-compose.yml 의 environment 에 SERVER_NAME=DOCKER1 과 같이 설정.
 *   필터가 JVM 환경변수에서 SERVER_NAME 을 읽어 응답 헤더에 주입.
 *   환경변수 없음(로컬 개발) → "LOCAL" 을 기본값으로 주입.
 *
 * OncePerRequestFilter:
 *   요청당 정확히 1회만 실행됨을 보장한다.
 */
@Component
public class ServerInfoFilter extends OncePerRequestFilter {

    // 앱 기동 시 1회만 읽음 — 런타임 중 변경되지 않으므로 필드로 캐싱
    private static final String SERVER_NAME =
            System.getenv("SERVER_NAME") != null ? System.getenv("SERVER_NAME") : "LOCAL";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // 모든 응답에 서버명 주입
        // 프론트엔드에서 axios response.headers['x-server-name'] 로 읽음
        response.setHeader("X-Server-Name", SERVER_NAME);

        filterChain.doFilter(request, response);
    }
}
