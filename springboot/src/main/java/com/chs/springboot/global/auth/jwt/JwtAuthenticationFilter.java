package com.chs.springboot.global.auth.jwt;

import com.chs.springboot.global.auth.dto.AuthenticatedUserInfo;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class JwtAuthenticationFilter extends OncePerRequestFilter { // Spring이 제공하는 필터 기반 클래스. 요청당 딱 한 번만 실행을 보장.
    private final JwtTokenProvider jwtTokenProvider;

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                 HttpServletResponse response,
                                 FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) { // header 값이 "Bearer eyJhbGci..." 형태라서 컷
            filterChain.doFilter(request, response);
            return;
        }
        String token = header.replace("Bearer ", "");
        boolean validToken = jwtTokenProvider.validateToken(token);
        if (!validToken) {
            filterChain.doFilter(request, response); // 유효하지 않을 때 예외를 던지면(500에러가남) 안됨, 다음 필터로 넘겨야 함
            return;
        }
        // 토큰이 유효하면 → Spring Security에게 "이 요청 인증됐어" 라고 알려야함 -> SecurityContext 에 Authentication 객체 넣음.
        AuthenticatedUserInfo authenticatedUserInfo = jwtTokenProvider.getUserInfo(token);
        List<GrantedAuthority> grantedAuthorityList = new ArrayList<GrantedAuthority>();
        for( String permission : authenticatedUserInfo.getPermissionCodes() ){
            grantedAuthorityList.add(new SimpleGrantedAuthority(permission));
        }
        UsernamePasswordAuthenticationToken authenticationToken // 인증된 사용자 정보 담는 그릇
                = new UsernamePasswordAuthenticationToken(authenticatedUserInfo.getUserId(), null, grantedAuthorityList); // 누구인지, 비밀번호(jwt 는 null), 권한목록
        SecurityContext securityContext = SecurityContextHolder.getContext();
        securityContext.setAuthentication(authenticationToken);
        filterChain.doFilter(request, response);
    }
}
