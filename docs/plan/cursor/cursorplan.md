# Cursor Plan (Single Source)

## 목표
- 기존 기능과 변경 기능을 동시에 유지한 상태로 배포한다.
- 변경 기능은 기본 비노출(Feature Flag OFF)로 배포하고, 관리자 권한 사용자만 프로덕션에서 검증한다.
- 검증 후 점진적으로 오픈한다.
- IP 체크 기능은 삭제하지 않고 보조 운영 수단으로 유지한다.

## 현재 상태 요약
- 권한 체크:
  - `SecurityConfig`에서 `/api/admin/**`는 `ADMIN_ACCESS` 권한 필요.
- IP 체크:
  - `AdminIpInterceptor` 구현은 존재하지만 `MonitorWebMvcConfig`에서 등록이 주석 처리되어 비활성.
  - 접근요청/허용IP/텔레그램 승인 플로우는 동작 코드가 남아 있음.
- Feature Flag:
  - `FeatureFlagService`, `FeatureFlagController`, `AdminPage`에 기존 플래그 관리 UI/API 존재.
- Theme:
  - `ThemeContext`가 `/api/site-theme`를 호출하여 테마 조회/변경.
  - 현재 UI 제어는 프론트 렌더 기준이며 서버 권한 강제는 미흡.
- Auth 예외 범위:
  - `AuthException` 기반으로 범위 축소가 반영되어 있음(해결됨).

## 핵심 원칙
- 보안 경계는 프론트 숨김이 아니라 백엔드 권한 검사로 보장한다.
- Feature Flag는 노출/동작 전환 제어용이다.
- IP 체크는 권한체크를 대체하지 않고, 필요 시 병행 가능한 운영 레이어로 유지한다.

## 구현 순서 (권장)

### 1단계: 플래그 설계 확정
- 신규 플래그를 명시적으로 추가:
  - `feature:theme:admin-controls` (기본 OFF)
  - `feature:admin:test-auth-v2` (기본 OFF, 예시)
- 각 플래그별 적용 범위를 문서화:
  - 노출만 제어인지
  - 동작/API 분기까지 제어인지
  - 완전 전환 후 제거 시점

### 2단계: 백엔드 안전장치 먼저
- 관리자 전용 변경 API는 `/api/admin/**` 하위로 정리하거나, 컨트롤러 단에서 권한 검증을 추가.
- theme 변경 API는 최소한 아래 중 하나를 만족:
  - `/api/admin/site-theme`로 이관
  - 또는 기존 경로 유지 시 서버 권한 체크(ADMIN_ACCESS) 추가
- 권한 없는 요청은 403/401 고정.

### 3단계: 프론트 Feature Flag 연동
- 플래그 조회 API(`GET /api/admin/feature-flags`)를 기준으로 렌더 분기.
- 변경 기능 UI(버튼/섹션)는 플래그 OFF 시 렌더하지 않음.
- 구기능/신기능 병행 시:
  - `if(flag) newFlow else oldFlow` 패턴으로 단일 진입점 유지.

### 4단계: 관리자 전용 검증 시나리오
- 프로덕션에서 일반 사용자:
  - 변경 UI 비노출 확인
  - 변경 API 호출 시 권한 거부 확인
- 프로덕션 관리자:
  - 플래그 ON 후 변경 기능 E2E 검증
  - 로그/메트릭 확인
- 필요 시 IP 체크를 임시 병행(운영 제어용)하여 접근 범위 추가 제한.

### 5단계: 점진 오픈
- 순서:
  1) 내부 관리자만 ON
  2) 제한 오픈(필요 시 특정 사용자군)
  3) 전체 오픈
- 이슈 발생 시 즉시 플래그 OFF로 롤백(코드 롤백 없이 차단).

### 6단계: 마무리 정리
- 완전 전환 후 old path/old UI 제거 계획 실행.
- 사용 종료된 플래그 정리(기술부채 방지).

## 파일별 작업 지점

### 백엔드
- `springboot/src/main/java/com/chs/springboot/global/feature/FeatureFlagService.java`
  - 신규 플래그 키/기본값/조회/설정 추가
- `springboot/src/main/java/com/chs/springboot/global/feature/FeatureFlagController.java`
  - 플래그 조회/패치 DTO 또는 맵 필드 확장
- `springboot/src/main/java/com/chs/springboot/global/feature/SiteThemeController.java`
  - theme 변경 API 권한 강제(관리자 경로 또는 권한 검사)
- `springboot/src/main/java/com/chs/springboot/global/config/SecurityConfig.java`
  - 신규 admin 경로 보안 규칙 확인/보강
- `springboot/src/main/java/com/chs/springboot/global/monitor/config/MonitorWebMvcConfig.java`
  - IP 인터셉터는 유지하되, 활성화 여부/적용 범위는 운영 정책으로 결정

### 프론트엔드
- `frontend/src/app/context/ThemeContext.jsx`
  - 테마 변경 호출 경로/권한 정책 반영
  - 플래그 OFF일 때 변경 액션 비활성 처리
- `frontend/src/domain/support/ui/TelegramPopup.jsx`
  - theme selector 렌더 조건을 `flag + admin 여부` 기준으로 제한
- `frontend/src/page/admin/AdminPage.jsx`
  - 플래그 관리 UI에 신규 플래그 토글 항목 추가

## 보안/노출 정책 (중요)
- 프론트에서 숨겨도 코드가 번들에 포함되면 F12로 존재를 추론할 수 있다.
- 따라서 “모르게”의 실질 보장은:
  - 서버 권한검사로 실행 차단
  - 필요 시 admin 전용 청크 분리(동적 import)로 노출 최소화
- 최종 보안은 항상 서버에서 결정.

## 테스트 계획
- 백엔드:
  - 권한 없는 사용자의 theme 변경 API 요청이 403/401인지 확인
  - 관리자 권한 사용자 요청은 정상 동작 확인
- 프론트:
  - 플래그 OFF: 변경 UI 비노출, 기존 기능 정상
  - 플래그 ON + 관리자: 변경 UI 노출 및 동작
  - 플래그 ON + 비관리자: UI 비노출 또는 클릭 불가 + 서버 차단 확인
- 통합:
  - 프로덕션에서 관리자 계정으로만 사전 검증 후 점진 오픈

## 완료 조건 (DoD)
- 변경 기능이 플래그 OFF 상태로 프로덕션 배포 가능
- 권한 없는 사용자는 서버 수준에서 변경 기능 실행 불가
- 관리자 검증 시나리오 완료
- 오픈/롤백(ON/OFF) 절차 문서화 완료
- IP 체크 기능은 코드 보존 및 정책 결정 상태 명확화

## Agent 실행 템플릿
```
@docs/plan/cursor/cursorplan.md

이 문서 순서대로 구현해.
요구사항:
1) 기존 기능 유지 + 변경 기능 플래그 제어.
2) 보안은 서버 권한검사로 강제.
3) IP 체크 기능은 삭제하지 말고 유지.
4) 프로덕션 사전검증(관리자만) 가능한 상태까지 만들고 테스트 결과 보고.
```

## 메모
- 본 파일만 플랜 단일 소스로 사용한다.
