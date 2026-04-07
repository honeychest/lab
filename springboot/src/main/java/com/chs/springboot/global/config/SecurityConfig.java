// [AGENT] Spring Security 설정 — 현재 모든 요청 허용 (anyRequest().permitAll())
// 로그인 추가 시 이 파일에서 requestMatchers로 세분화
// 연관: WebSocketConfig.java

/**
 * ─────────────────────────────────────────────────────────────────
 *  이 클래스의 역할
 * ─────────────────────────────────────────────────────────────────
 *  Spring Security가 모든 HTTP 요청을 기본으로 차단하는 것을 방지.
 *  현재는 인증 없이 모든 요청을 허용하는 가장 단순한 설정.
 *
 *  Spring Boot에 spring-boot-starter-security 의존성이 추가되면
 *  자동으로 모든 요청에 로그인을 요구하게 됨.
 *  (websocket 추가 시 내부적으로 security 의존성이 따라옴)
 *
 *  이 설정이 없으면 발생하는 문제:
 *    GET /api/binance/account → HTTP 401 Unauthorized (로그인 필요)
 *    WebSocket /ws/binance-price → 403 Forbidden
 *
 *  향후 로그인 기능 추가 시:
 *    anyRequest().permitAll() 대신
 *    .requestMatchers("/api/binance/**").authenticated()
 *    .requestMatchers("/ws/**").permitAll()
 *    등으로 세분화 가능.
 * ─────────────────────────────────────────────────────────────────
 */
package com.chs.springboot.global.config;

import com.chs.springboot.global.auth.jwt.JwtAuthenticationFilter;
import com.chs.springboot.global.auth.jwt.JwtTokenProvider;
import com.chs.springboot.global.auth.service.AuthService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * @Configuration:
 *   이 클래스가 Spring 설정 클래스임을 표시.
 *   @Bean 메서드가 포함된 클래스에 붙임.
 *   Spring이 앱 시작 시 이 클래스를 찾아 @Bean 메서드를 실행해 빈을 등록.
 *
 * @EnableWebSecurity:
 *   Spring Security의 웹 보안 기능을 활성화.
 *   이 어노테이션이 있어야 SecurityFilterChain @Bean이 인식됨.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    JwtTokenProvider jwtTokenProvider;
    AuthService authService;

    // cors.allowed-origins 프로퍼티가 없으면 빈 리스트 → CORS 비활성화 (prod)
    @Value("${cors.allowed-origins:}")
    private String allowedOriginsRaw;

    public SecurityConfig(JwtTokenProvider jwtTokenProvider, AuthService authService) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.authService = authService;
    }
    /**
     * filterChain: Spring Security 필터 체인 설정 빈.
     *
     * @Bean:
     *   이 메서드가 반환하는 SecurityFilterChain 객체를 Spring이 빈으로 관리.
     *   Spring Security가 이 빈을 찾아서 보안 설정으로 사용.
     *
     * @param http HttpSecurity 빌더 객체.
     *   메서드 체이닝(Builder 패턴)으로 보안 설정을 조합.
     *
     * @return 완성된 SecurityFilterChain 객체
     * @throws Exception HttpSecurity 설정 중 오류 발생 시
     *
     * 설정 내용:
     *
     * 1. csrf(csrf -> csrf.disable()):
     *    CSRF(Cross-Site Request Forgery) 보호 비활성화.
     *    CSRF = 악성 사이트에서 사용자의 인증 상태를 이용해 서버에 요청을 보내는 공격.
     *    REST API 서버에서 비활성화하는 이유:
     *      - REST API는 stateless (세션/쿠키 인증 없음)
     *      - axios 등의 클라이언트는 CSRF 토큰을 자동으로 처리하지 않음
     *      - JWT나 API Key로 인증하는 경우 CSRF는 의미 없음
     *    jQuery 비유: $.ajaxSetup에서 csrf 토큰 헤더를 안 보내도 되는 설정.
     *
     * 2. authorizeHttpRequests(auth -> auth.anyRequest().permitAll()):
     *    모든 HTTP 요청을 인증 없이 허용.
     *    anyRequest() = 어떤 URL이든
     *    .permitAll() = 누구든 접근 가능 (인증 불필요)
     *
     *    현재 이 서비스는 개인 홈 서버 용도이므로 인증 없이 허용.
     *    공개 서비스라면 반드시 인증 설정 필요.
     */
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        JwtAuthenticationFilter jwtAuthenticationFilter = new JwtAuthenticationFilter(jwtTokenProvider, authService);
        http
            // CSRF 보호 비활성화 (REST API + WebSocket 사용 시 필요)
            // CSRF는 사용자가 로그인된 상태를 악용해서, 악성 사이트가 몰래 서버에 요청을 보내는 공격
            // CSRF 보호가 있으면 서버가 "이 요청은 우리 사이트에서 온 게 맞아?" 토큰으로 검증
            // JWT는 브라우저가 자동으로 붙여주지 않고, 코드에서 명시적으로
            // Authorization 헤더에 넣어요. 악성 사이트는 그 토큰을 모르니까 CSRF 공격 자체가 불가능 해서 disable()
            .csrf(csrf -> csrf.disable())
            // cors.allowed-origins 가 있을 때만 CORS 활성화 (로컬 개발용)
            // prod 는 nginx same-origin 이라 불필요
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            // spring security 필터체인은 목록을 가지고 있고 순서대로 실행함. UsernamePasswordAuthenticationFilter의 위치도 정해져 있음
            // 인가 체크(FilterSecurityInterceptor)는 훨씬 뒤에 있음 그 전까지만 SecurityContext에 사용자 정보가 채워져 있으면 됨
            // 관례적으로 UsernamePasswordAuthenticationFilter를 기준점으로 많이 씀
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            // 모든 요청 인증 없이 허용
            .authorizeHttpRequests(auth -> auth.requestMatchers("/api/admin/**").hasAnyAuthority("ADMIN_ACCESS")
                .anyRequest().permitAll()
            );
        return http.build();
    }
    // CORS 관련 허용해주려고 했는데 서버는 nginx 가
    // nginx가 프론트(https://devcontext.duckdns.org)와 /api 백엔드를 같은 도메인으로 묶어주기 때문에 same-origin
    // prod: cors.allowed-origins 미설정 → 등록 없음 → CORS 필터 통과
    // local: cors.allowed-origins 설정 시 해당 origin만 허용
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // cors.allowed-origins 가 비어있으면 아무 origin도 허용 안 함 (prod)
        if (!allowedOriginsRaw.isBlank()) {
            List<String> origins = Arrays.asList(allowedOriginsRaw.split(","));
            config.setAllowedOrigins(origins);
            config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
            config.setAllowedHeaders(List.of("*"));
            config.setAllowCredentials(true); // withCredentials: true 와 쌍으로 필요
            source.registerCorsConfiguration("/**", config);
        }
        return source;
    }
}
