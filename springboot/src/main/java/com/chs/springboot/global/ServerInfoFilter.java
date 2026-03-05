// [AGENT] 역할: 모든 API 응답에 X-Server-Name 헤더 주입 (무중단 배포 컨테이너 식별) | 연관파일: docker-compose.yml(SERVER_NAME 환경변수 설정) | /ws 경로는 필터 스킵(shouldNotFilter) | SERVER_NAME 미설정 시 "LOCAL" 기본값
// Purpose: 모든 API 응답에 X-Server-Name 헤더를 주입하는 필터 — 컨테이너 식별용

package com.chs.springboot.global;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
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
@Slf4j
public class ServerInfoFilter extends OncePerRequestFilter {

    // 앱 기동 시 1회만 읽음 — 런타임 중 변경되지 않으므로 필드로 캐싱
    private static final String SERVER_NAME =
            System.getenv("SERVER_NAME") != null ? System.getenv("SERVER_NAME") : "LOCAL";

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) throws ServletException {
        String path = request.getServletPath();
        boolean skip = path != null && path.startsWith("/ws");
        // ✅ 로그 1: 필터를 건너뛰는지 여부 확인
        log.info("==> [Filter Check] Path: {}, ShouldSkip: {}", path, skip);
        return skip;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getServletPath();
        log.info("==> [Filter Start] Processing path: {}", path);

        try {
            // 헤더 추가
            response.setHeader("X-Server-Name", SERVER_NAME);
            log.info("==> [Filter Header] Added X-Server-Name: {}", SERVER_NAME);

            // ✅ 로그 2: 다음 필터로 넘어가기 직전 확인
            log.info("==> [Filter Progress] Calling filterChain.doFilter()...");
            filterChain.doFilter(request, response);

            // ✅ 로그 3: 요청 처리 완료 확인
            log.info("==> [Filter End] Request finished for path: {}", path);

        } catch (Exception e) {
            // ✅ 로그 4: 에러 발생 시 출력
            log.error("==> [Filter Error] Exception in ServerInfoFilter: ", e);
            throw e; // 에러를 다시 던져서 500 에러를 명확히 유도함
        }
    }
}
