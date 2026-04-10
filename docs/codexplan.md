# Feature Flag 적용 계획

## 현재 상태 요약

이 프로젝트는 feature flag를 완전히 새로 도입해야 하는 상태는 아니다. 이미 Spring Boot 백엔드에 간단한 flag 시스템이 있고, 일부 관리자 UI도 연결되어 있다.

- 백엔드: `global.feature.FeatureFlagService`, `FeatureFlagController`
- 프론트: `frontend/src/page/admin/AdminPage.jsx`
- 실제 서버 판정 사용처:
  - `domain.binance.controller.BinanceTradeController`
  - `global.monitor.controller.MonitorApiController`

즉, 방향은 "새 시스템 도입"보다는 "현재 Redis 기반 토글을 운영 가능한 feature flag 체계로 정리하고 확장"이 맞다.

## 목표

- 서버가 최종 판정하는 feature flag 체계를 만든다.
- 프론트는 노출/숨김과 UX 분기만 담당한다.
- 운영 중 안전하게 켜고 끌 수 있어야 한다.
- 플래그가 늘어나도 관리 가능한 구조를 만든다.
- 오래된 플래그를 제거할 수 있는 규칙까지 포함한다.

## 핵심 원칙

### 1. 서버를 단일 진실 원천으로 둔다

프론트에서 버튼이나 메뉴를 숨길 수는 있지만, 실제 기능 허용 여부는 반드시 백엔드에서 최종 판정해야 한다. 현재 구조도 이 방향과 맞다.

### 2. 플래그 종류를 분리한다

플래그는 목적별로 나눠야 한다.

- `release flag`: 새 기능을 점진 배포할 때 사용
- `ops flag`: 스케줄러, 수집기, 저장 기능 on/off
- `permission-like flag`: 관리자 기능 노출 제한

이 분류 없이 전부 같은 성격으로 취급하면 운영 중 의미가 섞여서 관리가 어려워진다.

### 3. 공개 대상과 내부 대상을 분리한다

모든 플래그를 프론트로 내려보내면 안 된다.

- 공개 가능 플래그: 프론트 UI 분기에 필요한 것만
- 관리자 전용 플래그: 어드민 화면에서 조회/수정
- 내부 전용 플래그: 서버 내부에서만 사용

## 현재 구조에서 보이는 문제

### 1. 정의가 코드에 하드코딩돼 있다

현재 `FeatureFlagService`는 flag key, 기본값, 이름을 코드에 직접 박아두고 있다. 이 방식은 초기에는 빠르지만 플래그가 늘어날수록 변경 지점이 많아진다.

### 2. 저장소가 Redis 단독이다

현재 feature flag는 Redis 값이 없으면 기본값으로 동작한다. 이 구조는 Redis 유실, 캐시 초기화, 재배포 상황에서 운영 상태가 의도치 않게 바뀔 수 있다.

### 3. 메타데이터가 없다

각 플래그에 대해 다음 정보가 없다.

- 왜 존재하는지
- 누가 책임지는지
- 언제 제거해야 하는지
- 공개 가능한지 여부

### 4. 프론트 적용 방식이 표준화되어 있지 않다

현재 어드민 페이지에는 연결이 되어 있지만, 다른 화면에서 확장할 때 공통 게이트 패턴이 아직 없다.

## 권장 구조

### 1. FeatureFlagDefinition 도입

각 플래그는 최소한 아래 정보를 가져야 한다.

- `key`
- `defaultValue`
- `description`
- `owner`
- `type`
- `exposure`
- `expiresAt`

예시:

```text
trade.threshold-edit
monitor.allowed-ip-manage
signal.experimental-panel
binance.raw-tick-storage
```

### 2. 저장소를 DB 원본 + Redis 캐시로 통합

이미 프로젝트에 `AppConfigService`와 `app_config` 테이블 구조가 있다. feature flag도 같은 패턴을 따르는 것이 좋다.

- DB: 원본 저장소
- Redis: 빠른 조회용 캐시
- 코드 기본값: DB/Redis 둘 다 없을 때만 fallback

이렇게 하면 운영 중 상태가 재시작이나 캐시 유실로 흔들리지 않는다.

### 3. API 분리

- `GET /api/feature-flags`
  - 프론트에 공개 가능한 플래그만 반환
- `GET /api/admin/feature-flags`
  - 관리자 전체 조회
- `PATCH /api/admin/feature-flags`
  - 관리자 수정

내부 전용 플래그는 프론트 API에 절대 포함하지 않는다.

### 4. 프론트 공통 게이트 도입

프론트에는 공통 훅 또는 래퍼를 두는 것이 좋다.

- `useFeatureFlags()`
- `FeatureGate`

적용 단위는 다음처럼 나눈다.

- 라우트 단위
- 페이지 섹션 단위
- 버튼/액션 단위

## 단계별 실행 계획

### 1단계. 기존 플래그 전수조사

먼저 현재 존재하는 플래그와 사용처를 정리한다.

- 어떤 플래그가 있는지
- 어느 컨트롤러/서비스/UI에서 쓰는지
- 공개 가능한지
- 운영용인지 릴리즈용인지

### 2단계. 공통 정의 모델 추가

`FeatureFlagDefinition` 또는 유사한 정의 구조를 추가한다.

포함 항목:

- key
- defaultValue
- description
- owner
- type
- exposure
- expiresAt

이 단계에서 하드코딩 Map 중심 구조를 줄인다.

### 3단계. 저장 구조 통합

현재 Redis 단독 조회 구조를 `AppConfigService` 패턴과 맞춘다.

- DB에서 원본 유지
- Redis 캐시 반영
- 조회 실패 시 fallback 처리

### 4단계. API 경계 정리

공개 API와 관리자 API를 분리하고, 노출 대상 필터링을 넣는다.

### 5단계. 프론트 공통 적용

프론트에서 매번 개별 API 호출과 조건 분기를 흩뿌리지 말고, 공통 hook 또는 context를 둔다.

추천 방향:

- 앱 시작 시 공개 플래그 로드
- 필요한 화면만 참조
- 로딩 전 기본 UX 정의

### 6단계. 테스트 추가

서버는 최소한 flag on/off 두 경우를 모두 검증해야 한다.

- 기능 허용 시 정상 동작
- 기능 비활성 시 차단 또는 fallback

특히 관리자 기능, 쓰기 기능, 수집기/스케줄러 기능은 반드시 테스트를 붙이는 게 좋다.

### 7단계. 운영 규칙 문서화

각 플래그마다 아래 내용을 남긴다.

- 만든 이유
- 기본값
- 누가 관리하는지
- 끄면 영향이 무엇인지
- 제거 예정일

이 문서화가 없으면 flag는 누적되는 기술부채가 된다.

## 이 프로젝트 기준 우선순위

### 1순위

백엔드 feature flag 저장/조회 구조를 정리한다.

- Redis 단독 구조 탈피
- DB 원본 + Redis 캐시로 정리

### 2순위

공개 플래그와 내부 플래그를 분리한다.

- 프론트로 내려도 되는 값만 공개
- 운영/관리 전용 값은 백엔드 내부 유지

### 3순위

프론트 공통 게이트를 도입한다.

- `useFeatureFlags`
- `FeatureGate`

### 4순위

메타데이터와 정리 규칙을 넣는다.

- owner
- expiresAt
- description
- removal rule

## 현실적인 2주 플랜

### 1주차

- 기존 플래그 목록 정리
- 사용처 분류
- 공통 정의 모델 설계
- DB + Redis 통합 방식 확정

### 2주차

- 백엔드 서비스 구조 개편
- 공개/관리자 API 분리
- 프론트 공통 훅 추가
- 핵심 플래그 on/off 테스트 추가

## 결론

이 프로젝트에서 feature flag 계획의 핵심은 다음이다.

- 서버 최종 판정 유지
- 현재 Redis 토글을 운영 가능한 구조로 확장
- 공개/비공개 플래그 구분
- 프론트 공통 게이트 도입
- 플래그 수명주기 관리 포함

즉, 단순히 "토글 하나 더 추가"가 아니라 운영 가능한 기준을 먼저 만들고 그 위에 기능을 올려야 한다.
