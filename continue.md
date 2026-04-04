# 이어서 할 작업

## 목표
admin API 접근 제어를 IP 허용 방식 → JWT + ADMIN_ACCESS 권한 기반으로 교체

## 완료된 것
- `JwtTokenProvider` — `getUserInfo(String token)` 추가 (userId + permissionCodes 반환)
- `AuthenticatedUserInfo` DTO 신규 생성 (`global/auth/dto/`)
- `JwtAuthenticationFilter` — permissionCodes → GrantedAuthority 변환 후 SecurityContext 저장
- `SecurityConfig` — JwtAuthenticationFilter 등록 + `/api/admin/**` → ADMIN_ACCESS 권한 필요
- `MonitorWebMvcConfig` — AdminIpInterceptor `/api/admin/**` 등록 주석 처리

## 다음 할 것: httpOnly 쿠키 방식으로 전환

현재 방식(JSON body로 토큰 반환)은 프론트가 localStorage에 저장해야 해서 XSS에 취약.
httpOnly 쿠키는 JS로 읽히지 않아 XSS에 강함.

### 변경 범위

**서버:**
1. `AuthController` — 로그인 응답을 `Set-Cookie` 헤더로 토큰 전달하도록 변경
2. `JwtAuthenticationFilter` — `Authorization` 헤더 대신 쿠키에서 토큰 꺼내도록 변경

**프론트:**
3. `apiClient.js` — `withCredentials: true` 추가
4. `AuthTestPage` — httpOnly 쿠키는 JS로 못 읽으므로 별도 처리 필요

### 진입점
`AuthController.java` login 메서드부터 시작