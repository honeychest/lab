package com.chs.springboot.global.auth.jwt;

import com.chs.springboot.global.auth.dto.AuthenticatedUserInfo;
import com.chs.springboot.global.auth.service.AuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter { // Spring이 제공하는 필터 기반 클래스. 요청당 딱 한 번만 실행을 보장.
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthService authService;

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider, AuthService authService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.authService = authService;
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                 HttpServletResponse response,
                                 FilterChain filterChain) throws ServletException, IOException {
        String token = null;
        String resolvedToken = null; // 최종적으로 인증에 사용할 토큰
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if("accessToken".equals(cookie.getName())) {
                    token = cookie.getValue();
                    break;
                }
            }
        }
        if (token == null) {
            filterChain.doFilter(request, response); // 토큰 없음 → doFilter → ... → FilterSecurityInterceptor
            // SecurityContext 비어있음 → 403 Forbidden
            return;
        } else if (jwtTokenProvider.validateToken(token)) {
            resolvedToken = token; // 쿠키에 있는 토큰을 써도됨(인증통과)
        } else { // 토큰이 있지만 인증에는 실패한 경우
            // refresh 시도
            String  refreshToken = null;
            for (Cookie cookie : cookies) {
                if("refreshToken".equals(cookie.getName())) {
                    refreshToken = cookie.getValue();
                    break;
                }
            }
            if(refreshToken != null) {
                try {
                    String newAccessToken = authService.refreshAccessToken(refreshToken);
                    Cookie newCookie = new Cookie("accessToken", newAccessToken);
                    newCookie.setHttpOnly(true);
                    newCookie.setPath("/");
                    response.addCookie(newCookie);
                    resolvedToken = newAccessToken;
                } catch (Exception e) {
                    log.warn("[JwtFilter] refresh 실패 exception={} message={}", e.getClass().getSimpleName(), e.getMessage());
                }
            }
        }
        // SecurityContext 세팅은 한 번만
        if (resolvedToken != null) {
            // 토큰이 유효하면 → Spring Security에게 "이 요청 인증됐어" 라고 알려야함 -> SecurityContext 에 Authentication 객체 넣음.
            AuthenticatedUserInfo userInfo = jwtTokenProvider.getUserInfo(resolvedToken);
            List<GrantedAuthority> authorities = new ArrayList<>();
            for (String permission : userInfo.getPermissionCodes()) {
                authorities.add(new SimpleGrantedAuthority(permission));
            }
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(userInfo.getUserId(), null, authorities)
            );
        }
        filterChain.doFilter(request, response); // 다음 필터로 진행
    }
}
