// Purpose: 모든 API 응답에 X-Server-Name 헤더를 주입하는 필터 — 로드밸런싱 Docker 컨테이너 식별용

package com.chs.springboot.global;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * ServerInfoFilter
 *
 * 모든 HTTP 요청 처리 후 응답 헤더에 X-Server-Name 을 자동으로 추가한다.
 * 프론트엔드는 기존 API 호출(예: /api/binance/account)의 응답 헤더를 읽어
 * 어느 Docker 컨테이너가 요청을 처리했는지 식별할 수 있다.
 *
 * 포트 매핑:
 *   8080 → docker1
 *   8081 → docker2
 *
 * OncePerRequestFilter:
 *   Spring이 제공하는 필터 기반 클래스. 요청당 정확히 1회만 실행됨을 보장한다.
 *   forward/include 등으로 내부 재호출이 발생해도 중복 실행되지 않음.
 */
@Component
public class ServerInfoFilter extends OncePerRequestFilter {

    /**
     * Spring Environment: application.properties, 환경변수, 시스템 프로퍼티 등
     * 모든 설정값에 접근할 수 있는 통합 인터페이스.
     *
     * local.server.port:
     *   Spring Boot가 내장 서버(Tomcat 등)를 실제로 기동한 뒤 자동으로 세팅하는 프로퍼티.
     *   application.properties에 server.port 를 명시하지 않아도 항상 실제 바인딩 포트를 반환.
     *   서버 기동 후에만 요청이 들어오므로 필터 실행 시점에는 반드시 세팅되어 있음.
     */
    private final Environment environment;

    public ServerInfoFilter(Environment environment) {
        this.environment = environment;
    }

    /**
     * 요청마다 1회 실행되는 핵심 필터 로직.
     *
     * @param request     현재 HTTP 요청
     * @param response    현재 HTTP 응답 (헤더 추가 대상)
     * @param filterChain 다음 필터 또는 실제 요청 핸들러로 넘기는 체인
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // 실제 바인딩 포트 조회 (서버 기동 후 Spring이 자동 세팅, null 없음)
        String port = environment.getProperty("local.server.port");

        if (port != null) {
            // 포트 기반으로 서버 이름 결정: 8081이면 docker2, 그 외(8080)면 docker1
            String serverName = "8081".equals(port) ? "docker2" : "docker1";

            // 응답 헤더에 서버 이름 주입
            // 프론트엔드에서 axios response.headers['x-server-name'] 로 읽을 수 있음
            response.setHeader("X-Server-Name", serverName);
        }

        // 다음 필터 또는 컨트롤러로 요청/응답 전달
        filterChain.doFilter(request, response);
    }
}
