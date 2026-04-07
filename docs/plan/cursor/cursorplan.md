# Cursor Plan (Single Source)

## 목적
- 배포 전 차단 이슈 중 `AuthExceptionHandler` 범위 과다 문제를 해결한다.
- 사용자 결정 사항을 반영한다:
  - `PATCH /api/site-theme` 공개 쓰기 구조(이슈 1)는 **이번 작업에서 변경하지 않는다**.
  - 이번 작업은 이슈 2(`IllegalArgumentException` 전역 가로채기)만 해결한다.

## 확정된 문제 정의
- 현재 `springboot/src/main/java/com/chs/springboot/global/auth/AuthExceptionHandler.java`가
  `@ExceptionHandler(IllegalArgumentException.class)`를 전역(`@RestControllerAdvice`)으로 처리한다.
- 결과적으로 인증과 무관한 `IllegalArgumentException`도 `401 + AUTH_LOGIN_FAILED`로 변질될 수 있다.
- 이는 API 응답 계약 회귀 위험이다.

## 해결 전략 (권장안 1번)
- 인증 도메인 전용 예외 타입을 도입한다: `AuthException`.
- Auth 관련 예외는 `AuthService`에서 `AuthException`으로 던진다.
- `AuthExceptionHandler`는 `AuthException`만 처리한다.
- 필요 시 추가 안전장치로 Advice 적용 범위를 `AuthController`로 한정한다.

## 작업 범위

### 포함
- `springboot/src/main/java/com/chs/springboot/global/auth/exception/AuthException.java` 신규 추가
- `springboot/src/main/java/com/chs/springboot/global/auth/service/AuthService.java` 내 auth 관련 throw 교체
- `springboot/src/main/java/com/chs/springboot/global/auth/AuthExceptionHandler.java` 핸들러 범위 축소
- auth 컨트롤러 테스트 보강(필요한 최소 범위)

### 제외
- site-theme 권한 정책 변경
- auth 외 도메인 서비스/컨트롤러 예외 정책 변경
- 프론트엔드 화면/응답 파서 변경

## 파일별 구현 지시

### 1) AuthException 신규 추가
- 파일: `springboot/src/main/java/com/chs/springboot/global/auth/exception/AuthException.java`
- 요구사항:
  - `RuntimeException` 상속
  - 필드:
    - `String errorCode`
    - `HttpStatus httpStatus`
  - 생성자에서 message/errorCode/httpStatus 설정
  - getter 제공

권장 기본값:
- httpStatus가 없는 생성자 오버로드를 둘 경우 기본 `HttpStatus.UNAUTHORIZED`

### 2) AuthService 예외 교체
- 파일: `springboot/src/main/java/com/chs/springboot/global/auth/service/AuthService.java`
- 교체 대상:
  - 로그인 실패(이메일/비밀번호 불일치)
  - 비활성 계정
  - refresh 토큰 invalid
  - refresh 토큰 미존재/만료
- 기존 `IllegalArgumentException` -> `AuthException`으로 변경

권장 코드 매핑:
- `AUTH_LOGIN_FAILED` (401)
- `AUTH_ACCOUNT_DISABLED` (403 또는 정책상 401)
- `AUTH_REFRESH_INVALID` (401)
- `AUTH_REFRESH_NOT_FOUND` (401)

주의:
- AuthService 내부라도 인증 로직과 무관한 예외는 무조건 바꾸지 말고 문맥 확인 후 적용

### 3) AuthExceptionHandler 수정
- 파일: `springboot/src/main/java/com/chs/springboot/global/auth/AuthExceptionHandler.java`
- 변경사항:
  - `@ExceptionHandler(IllegalArgumentException.class)` 제거
  - `@ExceptionHandler(AuthException.class)`로 변경
  - 응답 바디: `AuthErrorResponse(message, errorCode)` 사용
  - 응답 상태코드: `authException.getHttpStatus()`

선택(권장) 보강:
- `@RestControllerAdvice(assignableTypes = { AuthController.class })`
  - auth 컨트롤러 범위로 advice 적용을 추가 제한

## 비회귀 기준 (필수)
- auth가 아닌 곳의 `IllegalArgumentException` 응답 계약은 기존과 동일해야 함.
- 예시:
  - `features/contact` 계열의 guestToken 검증 실패 응답이 auth 실패 포맷으로 바뀌지 않아야 함.
  - binance 도메인 파라미터 검증 오류가 auth 401로 바뀌지 않아야 함.

## 테스트 지시

### 백엔드 단위/웹 테스트
- 파일(보강): `springboot/src/test/java/com/chs/springboot/global/auth/controller/AuthControllerWebMvcTest.java`
- 검증 항목:
  1. 로그인 실패 시 `401` + `AUTH_LOGIN_FAILED`
  2. refresh invalid/not found 시 `401` + 대응 코드
  3. (가능하면) auth 외 `IllegalArgumentException`이 auth 에러 포맷으로 변환되지 않음

### 실행 검증
- `springboot`: `./gradlew.bat test`
- 실패 시 원인과 영향 파일을 보고서에 명시

## 완료 조건 (DoD)
- `AuthException` 도입 완료
- `AuthService`의 auth 관련 예외가 `AuthException`으로 교체됨
- `AuthExceptionHandler`가 `AuthException`만 처리함
- 전체 테스트 통과
- auth 외 API 응답 계약 회귀 없음(최소 1개 이상 샘플 검증 결과 제시)

## 에이전트 시작용 템플릿
아래 문장을 Agent 창에 그대로 붙여서 실행한다.

```
@docs/plan/cursor/cursorplan.md

이 문서 지시대로 구현해.
주의:
1) site-theme 권한 정책은 건드리지 말 것.
2) 이번 작업은 AuthExceptionHandler 범위 과다 문제만 해결.
3) 변경 후 gradle test 실행 결과와 비회귀 확인 내용을 보고.
```

## 메모
- 본 파일만 플랜 단일 소스로 사용한다.
