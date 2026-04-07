// [AGENT] 인증 서비스 — 이메일/비밀번호 검증, 권한 조회, JWT 발급, refresh token Redis 저장
package com.chs.springboot.global.auth.service;

import com.chs.springboot.global.auth.dto.AccessTokenDebugResponse;
import com.chs.springboot.global.auth.dto.AuthTokenPair;
import com.chs.springboot.global.auth.dto.AuthenticatedUser;
import com.chs.springboot.global.auth.dto.CookieDebugResponse;
import com.chs.springboot.global.auth.dto.RefreshTokenDebugResponse;
import com.chs.springboot.global.auth.entity.UserAccount;
import com.chs.springboot.global.auth.entity.UserAccountPermission;
import com.chs.springboot.global.auth.exception.AuthException;
import com.chs.springboot.global.auth.jwt.JwtTokenProvider;
import com.chs.springboot.global.auth.repository.UserAccountPermissionRepository;
import com.chs.springboot.global.auth.repository.UserAccountRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

@Service
@Slf4j
public class AuthService {
    private final UserAccountRepository userAccountRepository; // final 로 생성시점에 한번 주입되면 이부 변경불가하게 만들기
    private final PasswordEncoder passwordEncoder;
    private final UserAccountPermissionRepository userAccountPermissionRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final StringRedisTemplate stringRedisTemplate;

    public AuthService(UserAccountRepository userAccountRepository,
                       PasswordEncoder passwordEncoder,
                       UserAccountPermissionRepository userAccountPermissionRepository,
                       JwtTokenProvider jwtTokenProvider,
                       StringRedisTemplate stringRedisTemplate) {
        this.userAccountRepository = userAccountRepository; // email로 계정조회
        this.passwordEncoder = passwordEncoder; // 비밀번호 검증용
        this.userAccountPermissionRepository = userAccountPermissionRepository; // 권한 목록 조회
        this.jwtTokenProvider = jwtTokenProvider; // 토큰 생성
        this.stringRedisTemplate = stringRedisTemplate; // REDIS 에 토큰저장
    }

    public AuthenticatedUser authenticate(String email, String password) {
        // email 로 사용자를 찾고 . 있다면 꺼내고 . 없으면 IllegalArgumentException 을 던져라
        UserAccount account = userAccountRepository.findByEmail(email)
                // .orElseThrow(예외 만드는 코드) 미친 람다식 못쓰게 하던지 해야지 안읽히네...
                /* 풀어서 쓰면
                    * UserAccount found = userAccountRepository.findByEmail(email);
                    * if (found == null) {throw new IllegalArgumentException(...);}
                    * - 단계별 절차형 코드로 작성
                      - 한 줄에 한 동작만 수행
                      - 중간 결과는 반드시 변수로 분리
                      - null/조건 검사는 if 문으로 명시
                      - 람다, 체이닝, 스트림, 삼항 연산자 사용 금지
                      - [람다 없이] [체이닝 없이] [단계형 변수로] [if 문 우선] 이런걸 요청하면 저렇게 풀어준다고함 */
                .orElseThrow(() -> new AuthException("이메일 또는 비밀번호가 올바르지 않습니다.", "AUTH_LOGIN_FAILED"));
        if(!account.getEnabled()){
            throw new AuthException(
                    "비활성화 된 계정입니다. 관리자에게 문의해주세요.",
                    "AUTH_ACCOUNT_DISABLED",
                    HttpStatus.FORBIDDEN
            );
        }
        if(!passwordEncoder.matches(password, account.getPasswordHash())){
            throw new AuthException("이메일 또는 비밀번호가 올바르지 않습니다.", "AUTH_LOGIN_FAILED");
        }
        List<UserAccountPermission> userAccountPermissions = userAccountPermissionRepository.findByUserAccount(account);
        List<String> permissionCodes = new ArrayList<>();
        if(!userAccountPermissions.isEmpty()){
            for ( UserAccountPermission userAccountPermission : userAccountPermissions ){ // 없으면 0번돌고 끝나서 isEmpty 안해도된다고함.
                permissionCodes.add(userAccountPermission.getUserPermission().getCode());
            }
        }
        AuthenticatedUser authenticatedUser = new AuthenticatedUser(account, permissionCodes);
        return authenticatedUser;
    }

    public AuthTokenPair login(String email, String password){
        AuthenticatedUser  authenticatedUser = authenticate(email, password);
        AuthTokenPair authTokenPair = jwtTokenProvider.createAuthTokenPair(authenticatedUser);
        // last_login_at 업데이트
        UserAccount userAccount = authenticatedUser.getAccount();
        userAccount.setLastLoginAt(LocalDateTime.now());
        userAccountRepository.save(userAccount);
        setRedisRefreshToken(String.valueOf(authenticatedUser.getAccount().getId()), authTokenPair);
        log.info("[Auth] login completed userId={}", authenticatedUser.getAccount().getId());
        return authTokenPair;
    }

    public void setRedisRefreshToken(String userId, AuthTokenPair authTokenPair){
        String refreshToken = authTokenPair.getRefreshToken();
        String redisKey = "auth:refresh:"+refreshToken;
        // 여기서 사용된 REDIS 의 set은 "key", "value", "유지시간(초)"
        stringRedisTemplate.opsForValue().set(
                redisKey,
                userId,
                jwtTokenProvider.getRefreshTokenExpirationSeconds(),
                TimeUnit.SECONDS
        );
    }

    public RefreshTokenDebugResponse getRefreshTokenDebug(String refreshToken) {
        String redisKey = "auth:refresh:" + refreshToken;
        String userId = stringRedisTemplate.opsForValue().get(redisKey);
        Long ttlSeconds = stringRedisTemplate.getExpire(redisKey, TimeUnit.SECONDS);
        boolean exists = userId != null;
        return new RefreshTokenDebugResponse(redisKey, userId, ttlSeconds, exists);
    }

    // accessToken 재발급
    @Transactional(readOnly = true)
    public String refreshAccessToken(String refreshToken) {
        boolean valid = jwtTokenProvider.validateToken(refreshToken);
        if (!valid) {
            throw new AuthException("유효하지 않은 refresh token 입니다.", "AUTH_REFRESH_INVALID");
        }

        String redisKey = "auth:refresh:" + refreshToken;
        String userIdStr = stringRedisTemplate.opsForValue().get(redisKey);
        if (userIdStr == null) {
            throw new AuthException("만료되었거나 존재하지 않는 refresh token 입니다.", "AUTH_REFRESH_NOT_FOUND");
        }

        Long userId = Long.valueOf(userIdStr);
        UserAccount account = userAccountRepository.findById(userId)
                .orElseThrow(() -> new AuthException("사용자를 찾을 수 없습니다.", "AUTH_USER_NOT_FOUND"));

        if (!account.getEnabled()) {
            throw new AuthException(
                    "비활성화 된 계정입니다. 관리자에게 문의해주세요.",
                    "AUTH_ACCOUNT_DISABLED",
                    HttpStatus.FORBIDDEN
            );
        }

        List<UserAccountPermission> userAccountPermissions = userAccountPermissionRepository.findByUserAccount(account);
        List<String> permissionCodes = new ArrayList<>();
        for (UserAccountPermission userAccountPermission : userAccountPermissions) {
            permissionCodes.add(userAccountPermission.getUserPermission().getCode());
        }

        AuthenticatedUser authenticatedUser = new AuthenticatedUser(account, permissionCodes);
        String newAccessToken = jwtTokenProvider.createAccessToken(authenticatedUser);
        log.info("[Auth] access token refreshed userId={}", userId);
        return newAccessToken;
    }

    public AccessTokenDebugResponse getAccessTokenDebug(String accessToken) {
        return jwtTokenProvider.getAccessTokenDebug(accessToken);
    }

    // httpOnly 쿠키에서 꺼낸 accessToken/refreshToken으로 디버그 정보 반환
    // 쿠키가 없는 경우(null)도 graceful하게 처리
    public CookieDebugResponse getCookieDebug(String accessToken, String refreshToken) {
        CookieDebugResponse.AccessInfo accessInfo;
        if (accessToken == null) {
            accessInfo = new CookieDebugResponse.AccessInfo(false, null, null, null, null);
        } else {
            AccessTokenDebugResponse accessDebug = jwtTokenProvider.getAccessTokenDebug(accessToken);
            accessInfo = new CookieDebugResponse.AccessInfo(
                accessDebug.getValid(),
                accessDebug.getSubject(),
                accessDebug.getPermissionCodes(),
                accessDebug.getIssuedAt(),
                accessDebug.getExpiresAt()
            );
        }

        CookieDebugResponse.RefreshInfo refreshInfo;
        if (refreshToken == null) {
            refreshInfo = new CookieDebugResponse.RefreshInfo(false, null);
        } else {
            RefreshTokenDebugResponse refreshDebug = getRefreshTokenDebug(refreshToken);
            refreshInfo = new CookieDebugResponse.RefreshInfo(refreshDebug.getExists(), refreshDebug.getTtlSeconds());
        }

        return new CookieDebugResponse(accessInfo, refreshInfo);
    }

    /** Redis에 저장된 refresh 토큰 매핑만 삭제한다. httpOnly 쿠키는 그대로 둔다(테스트·진단용). */
    public void invalidateRefreshTokenIfPresent(String refreshToken) {
        if (refreshToken == null || refreshToken.isBlank()) {
            return;
        }
        String redisKey = "auth:refresh:" + refreshToken;
        Boolean deleted = stringRedisTemplate.delete(redisKey);
        log.warn("[Auth] refresh token invalidated key={} deleted={}", redisKey, deleted);
    }

}
