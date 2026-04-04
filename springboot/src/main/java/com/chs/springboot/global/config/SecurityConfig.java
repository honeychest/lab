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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.servlet.resource.ResourceResolver;

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
    public SecurityConfig(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
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
        JwtAuthenticationFilter jwtAuthenticationFilter = new JwtAuthenticationFilter(jwtTokenProvider);
        http
            // CSRF 보호 비활성화 (REST API + WebSocket 사용 시 필요)
            // CSRF는 사용자가 로그인된 상태를 악용해서, 악성 사이트가 몰래 서버에 요청을 보내는 공격
            // CSRF 보호가 있으면 서버가 "이 요청은 우리 사이트에서 온 게 맞아?" 토큰으로 검증
            // JWT는 브라우저가 자동으로 붙여주지 않고, 코드에서 명시적으로
            // Authorization 헤더에 넣어요. 악성 사이트는 그 토큰을 모르니까 CSRF 공격 자체가 불가능 해서 disable()
            .csrf(csrf -> csrf.disable())
            // addFilterBefore(A, B)의 두 인자 A — 끼워 넣을 필터 객체 B — "A를 이것보다 앞에 실행해라"는 기준점
            // .class는 "이 클래스 자체"를 가리켜요. 객체(인스턴스)가 아니라 클래스 타입정보를 전달
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
            // 모든 요청 인증 없이 허용
            .authorizeHttpRequests(auth -> auth.requestMatchers("/api/admin/**").hasAnyAuthority("ADMIN_ACCESS")
                .anyRequest().permitAll()
            );
        return http.build();
    }
    @Bean
    public PasswordEncoder passwordEncoder() {
        // 인코더 생성 -> 알고리즘을 SHA256 계열로 지정 -> 반환
        return new Pbkdf2PasswordEncoder(
                "", // 추가 secret(perpper) 없음
                16, // salt 길이
                610000, // 반복횟수 SWASP 권고 60만회 이상.
                Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256 // 해시 알고리즘
        );

    }
}
