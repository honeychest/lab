# 이어서 할 작업

## 브랜치
`features/httponly-cookie`

## 목표
admin API 접근 제어를 JWT + httpOnly 쿠키 방식으로 완성

---

## 완료된 것

### 인증 흐름
- `AuthController` — 로그인 시 `accessToken`, `refreshToken` httpOnly 쿠키로 발급
- `JwtAuthenticationFilter` — Authorization 헤더 → `accessToken` 쿠키에서 토큰 읽도록 변경
- `apiClient.js` — `withCredentials: true` 추가 (쿠키 자동 전송)
- `SecurityConfig` — CORS 설정 추가 (로컬 개발용, `cors.allowed-origins` 프로퍼티로 제어)
- `application-local.properties` — `cors.allowed-origins` 추가

### 로그인 페이지
- `AdminLoginPage.jsx` — `/api/auth/login` 실제 연동 완료
- `AdminPage.jsx` — 403 시 현재 경로(`location.pathname`)를 state로 담아 `/admin/login`으로 이동
- 로그인 성공 후 `location.state.from` 경로로 복귀

### 테스트 페이지
- `AuthTestPage.jsx` — httpOnly 쿠키 기반으로 전면 재작성
  - 로그인 후 `/api/admin/test/auth/debug/cookie-info` 자동 호출
  - 서버 응답으로 token summary 표시
- `AdminAuthTestController` — `GET /debug/cookie-info` 추가 (쿠키에서 토큰 읽어 디버그 정보 반환)
- `CookieDebugResponse` DTO 신규 생성
- `AuthService.getCookieDebug()` 추가

### 기타
- `ThemeContext.jsx` — 컴포넌트/훅 분리 (`useTheme.js` 신규)
- `externalClient.js` — 외부 API 전용 axios 인스턴스 (Binance 등 withCredentials 없음)
- `useBinanceKlines.js` — Binance URL 호출 시 `externalClient` 사용

---

## 다음 할 것: refresh token 엔드포인트 구현

accessToken 만료(기본 36초, `.env`의 `ADMIN_JWT_ACCESS_TOKEN_EXPIRATION_SECONDS` 값) 시 자동 갱신 필요.

### 서버
1. `AuthService.refreshAccessToken(String refreshToken)`
   - Redis에서 `refresh:{token}` 조회 → userId 확인
   - userId로 UserAccount + 권한 로드 (findById 사용)
   - 새 accessToken 생성 후 반환
   - Redis에 없으면 예외 던짐

2. `POST /api/auth/refresh` (AuthController)
   - `refreshToken` 쿠키 읽기
   - `authService.refreshAccessToken()` 호출
   - 새 `accessToken` 쿠키 Set-Cookie
   - SecurityConfig에서 이 경로는 permitAll 확인 필요

### 프론트
3. `apiClient.js` — 401/403 응답 시 interceptor에서 `/api/auth/refresh` 호출
   - 성공: 원래 요청 재시도
   - 실패: `/admin/login` 이동

### 진입점
`AuthService.java` → `refreshAccessToken` 메서드 추가부터 시작
`UserAccountRepository`에 `findById` 있음 (JPA 기본 제공)
`UserAccountPermissionRepository`에 `findByUserAccount` 있음

---

## 참고: 현재 토큰 만료 설정 (테스트값)
- accessToken: 36초 (`ADMIN_JWT_ACCESS_TOKEN_EXPIRATION_SECONDS`)
- refreshToken: 864초 (`ADMIN_JWT_REFRESH_TOKEN_EXPIRATION_SECONDS`)
- refresh 완성 후 운영값으로 조정 필요 (accessToken 3600초, refreshToken 604800초 권장)
