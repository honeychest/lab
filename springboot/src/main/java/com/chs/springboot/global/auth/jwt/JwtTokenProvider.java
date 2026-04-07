// [AGENT] JWT 토큰 제공자 — access/refresh token 생성과 만료시간 제공 담당
package com.chs.springboot.global.auth.jwt;

import com.chs.springboot.global.auth.dto.AccessTokenDebugResponse;
import com.chs.springboot.global.auth.dto.AuthTokenPair;
import com.chs.springboot.global.auth.dto.AuthenticatedUser;
import com.chs.springboot.global.auth.dto.AuthenticatedUserInfo;
import com.chs.springboot.global.auth.entity.UserAccount;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Component
@Slf4j
public class JwtTokenProvider {

//    private final String secret;
    private final long accessTokenExpirationSeconds;
    private final long refreshTokenExpirationSeconds;
    private final SecretKey key;


    public JwtTokenProvider(@Value("${admin.jwt.secret}") String secret,
                            @Value("${admin.jwt.access-token-expiration-seconds}") long accessTokenExpirationSeconds,
                            @Value("${admin.jwt.refresh-token-expiration-seconds}")long refreshTokenExpirationSeconds) {
//        this.secret = secret;
        this.accessTokenExpirationSeconds = accessTokenExpirationSeconds;
        this.refreshTokenExpirationSeconds = refreshTokenExpirationSeconds;
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String createAccessToken(AuthenticatedUser authenticatedUser) {
        // JWT builder에 넘길 재료를 변수로 정리
        UserAccount account = authenticatedUser.getAccount();
        List<String> permissionCodes = authenticatedUser.getPermissionCodes();
        Long userId = account.getId();
        String email = account.getEmail();
        Date now = new Date();
        // JWT exp는 보통 시각(Date) 형태를 이용
        Date accessTokenExpirationDate = new Date(now.getTime() + accessTokenExpirationSeconds*1000);

        JwtBuilder builder = Jwts.builder();
        builder.subject(String.valueOf(account.getId())); // JWT 표준에 원래 있는 필드 subject "토큰의 주인이 누구"인지 담는 전용 필드
        builder.claim("email", email); // claim 부가정보
        builder.claim("permissionCodes", permissionCodes); // claim 부가정보
        builder.issuedAt(now);
        builder.expiration(accessTokenExpirationDate);
        builder.signWith(key);

        log.warn("[Auth] access token created userId={} permissionCount={}", account.getId(), permissionCodes.size());
        return builder.compact();
    }

    public String createRefreshToken(AuthenticatedUser authenticatedUser) {
        Long userId = authenticatedUser.getAccount().getId();
        Date now = new Date();
        Date refreshTokenExpirationDate = new Date(now.getTime() + refreshTokenExpirationSeconds*1000);

        JwtBuilder builder = Jwts.builder();
        builder.subject(String.valueOf(userId));
        builder.issuedAt(now);
        builder.expiration(refreshTokenExpirationDate);
        builder.signWith(key);
        log.warn("[Auth] refresh token created userId={}", userId);
        return builder.compact();
    }

    public boolean validateToken(String token) {
        try {
            JwtParserBuilder jwtParserBuilder = Jwts.parser(); // JWT 파서를 만들기 위한 빌더 객체 생성 (아직 파서 완성 전)
            jwtParserBuilder.verifyWith(key); // 이 파서는 key 로 서명을 검증해야 한다고 설정
            JwtParser jwtParser = jwtParserBuilder.build(); // 설정 완료 → 실제 파서 객체 완성
            jwtParser.parseSignedClaims(token); // 토큰을 파싱하면서 서명 검증 실행 (위조됐으면 여기서 예외 발생)
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public AuthenticatedUserInfo getUserInfo(String token) {
        JwtParserBuilder jwtParserBuilder = Jwts.parser();
        jwtParserBuilder.verifyWith(key);
        JwtParser jwtParser = jwtParserBuilder.build();
        try {
            Jws<Claims> claims = jwtParser.parseSignedClaims(token); // 토큰 파싱 + 서명 검증 실행, 결과(헤더+페이로드+서명 전체)를 jws에 담음
            Long userId = Long.valueOf(claims.getPayload().getSubject());  // 헤더-알고리즘정보, 페이로드-실제데이터, 서명-위조방지
            @SuppressWarnings("unchecked")
            List<String> permissionCodes = (List<String>) claims.getPayload().get("permissionCodes");
            return new AuthenticatedUserInfo(userId, permissionCodes);
        } catch (Exception e){
            throw new JwtException("Invalid token");
        }
    }

    public AccessTokenDebugResponse getAccessTokenDebug(String accessToken) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(accessToken)
                    .getPayload();

            @SuppressWarnings("unchecked")
            List<String> permissionCodes = (List<String>) claims.get("permissionCodes");

            return new AccessTokenDebugResponse(
                    true,
                    "ACCESS_TOKEN_VALID",
                    claims.getSubject(),
                    claims.get("email", String.class),
                    permissionCodes,
                    String.valueOf(claims.getIssuedAt()),
                    String.valueOf(claims.getExpiration())
            );
        } catch (ExpiredJwtException e) {
            Claims claims = e.getClaims();
            @SuppressWarnings("unchecked")
            List<String> permissionCodes = claims != null ? (List<String>) claims.get("permissionCodes") : null;

            return new AccessTokenDebugResponse(
                    false,
                    "ACCESS_TOKEN_EXPIRED",
                    claims != null ? claims.getSubject() : null,
                    claims != null ? claims.get("email", String.class) : null,
                    permissionCodes,
                    claims != null ? String.valueOf(claims.getIssuedAt()) : null,
                    claims != null ? String.valueOf(claims.getExpiration()) : null
            );
        } catch (JwtException | IllegalArgumentException e) {
            return new AccessTokenDebugResponse(
                    false,
                    "ACCESS_TOKEN_INVALID",
                    null,
                    null,
                    null,
                    null,
                    null
            );
        }
    }

    public AuthTokenPair createAuthTokenPair(AuthenticatedUser authenticatedUser) {
        String accessToken = createAccessToken(authenticatedUser);
        String refreshToken = createRefreshToken(authenticatedUser);
        return new AuthTokenPair(accessToken, refreshToken);
    }

    public Long getAccessTokenExpirationSeconds() {
        return accessTokenExpirationSeconds;
    }

    public Long getRefreshTokenExpirationSeconds() {
        return refreshTokenExpirationSeconds;
    }
}
