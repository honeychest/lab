# Frontend Structure Guide

## 목적
- 현재 프로젝트의 폴더 규칙을 단수 네이밍으로 고정한다.
- 코드 탐색성과 이동/리팩터링 비용을 낮춘다.

## 기준 구조
```txt
src/
  app/
  page/
  domain/
  entity/
  shared/
```

## 폴더 계약

### app
- 역할: 앱 부트스트랩, 전역 조립.
- 포함: `main.jsx`, `App.jsx`, `router/`, `style/`.
- 금지: 도메인 비즈니스 로직, 도메인 API 구현.

### page
- 역할: URL 라우트 단위 화면 엔트리.
- 포함: 화면 조합 코드.
- 금지: 재사용 가능한 도메인 로직/공용 유틸 구현.

### domain
- 역할: 도메인별 기능 구현 (`binance`, `weather`, `support`).
- 권장 하위 폴더: `ui/`, `model/`, `api/`, `lib/`, `type/`.
- 금지: 다른 도메인 내부 경로 직접 참조.

### entity
- 역할: 도메인 데이터 정의/순수 변환.
- 포함: 타입, 매퍼, 순수 함수.
- 금지: 화면 의존 코드, 네트워크 호출 중심 로직.

### shared
- 역할: 도메인 독립 공용 자산.
- 권장 하위 폴더: `ui/`, `hook/`, `api/`, `lib/`, `asset/`, `config/`, `type/`.
- 금지: 특정 도메인 정책이 강한 비즈니스 코드.

## 의존 규칙
- `app` -> `page`, `domain`, `entity`, `shared`
- `page` -> `domain`, `entity`, `shared`
- `domain` -> `entity`, `shared`
- `entity` -> `shared`
- `shared` -> 상위 레이어 참조 금지

## 네이밍 규칙
- 폴더: 단수만 사용 (`page`, `domain`, `entity`, `style`, `hook`, `type` ...)
- 컴포넌트 파일: `PascalCase`
- 훅/유틸 파일: `camelCase`

## 현재 기준 진입점
- 엔트리: `index.html` -> `/src/app/main.jsx`
- 앱 셸: `src/app/App.jsx`
- 라우터: `src/app/router/MainRouter.jsx`

## 현재 정리 TODO
- `domain/weather/lib/weatherUtils.js` vs `entity/weather/lib/weatherUtils.ts` 중복 정리
- `entity/weather/lib/cesiumUtils.js` 위치 재검토 (`domain/weather/lib` 이동 후보)
- `domain/binance/model/hooks`와 `domain/weather/model/hook` 네이밍 통일 (`hook` 또는 `hooks` 중 단수 규칙으로 최종 확정)

## 완료 기준
- 단수 네이밍 규칙 위반 폴더가 없다.
- import 경로가 의존 규칙을 위반하지 않는다.
- 중복 유틸이 제거된다.
