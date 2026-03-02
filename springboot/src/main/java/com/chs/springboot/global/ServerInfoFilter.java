// Purpose: 모든 API 응답에 X-Server-Name 헤더를 주입하는 필터 — 로드밸런싱 Docker 컨테이너 식별용

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
 * 프론트엔드는 기존 API 호출의 응답 헤더를 읽어 어느 Docker 컨테이너가
 * 요청을 처리했는지 식별할 수 있다.
 *
 * 식별 방식:
 *   Nginx가 proxy_set_header X-Backend-Port $proxy_port; 설정으로
 *   요청 헤더에 실제 백엔드 포트를 주입 → 필터가 읽어서 서버명 결정.
 *   컨테이너 내부 포트는 항상 8080이지만,
 *   Nginx가 알려주는 $proxy_port 는 호스트 포트(8080/8081)라 구별 가능.
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
@Slf4j
public class ServerInfoFilter extends OncePerRequestFilter {

    /**
     * 요청마다 1회 실행되는 핵심 필터 로직.
     *
     * @param request     현재 HTTP 요청 (Nginx가 주입한 X-Backend-Port 헤더 포함)
     * @param response    현재 HTTP 응답 (X-Server-Name 헤더 추가 대상)
     * @param filterChain 다음 필터 또는 실제 요청 핸들러로 넘기는 체인
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // Nginx가 proxy_set_header X-Backend-Port $proxy_port 로 주입한 호스트 포트 읽기.
        // 로컬 개발 환경(Nginx 없음)에서는 null → 헤더 미추가 → 프론트 배지 꺼진 상태 유지.
        String backendPort = request.getHeader("X-Backend-Port");
        log.info("[ServerInfoFilter] uri={}, x-backend-port={}", request.getRequestURI(), backendPort);
        if (backendPort != null) {
            // 호스트 포트 기반 서버명 결정: 8081이면 docker2, 그 외(8080)면 docker1
            String serverName = "8081".equals(backendPort) ? "docker2" : "docker1";
            log.info("[ServerInfoFilter] resolved serverName={} from x-backend-port={}", serverName, backendPort);
            // 응답 헤더에 서버명 주입
            // 프론트엔드에서 axios response.headers['x-server-name'] 로 읽음
            response.setHeader("X-Server-Name", serverName);
        }

        // 다음 필터 또는 컨트롤러로 요청/응답 전달
        filterChain.doFilter(request, response);
    }
}
