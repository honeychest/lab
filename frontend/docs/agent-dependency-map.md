# Agent Dependency Map

## 레이어
- `app`
- `page`
- `domain`
- `entity`
- `shared`

## 허용 의존 방향
- `app` -> `page`, `domain`, `entity`, `shared`
- `page` -> `domain`, `entity`, `shared`
- `domain` -> `entity`, `shared`
- `entity` -> `shared`
- `shared` -> 상위 레이어 참조 금지

## 금지 규칙
- `domain`이 다른 `domain` 내부 구현 경로를 직접 참조하지 않는다.
- `shared`에서 `domain/page/app/entity`를 import하지 않는다.
- `page`에 비즈니스 로직/도메인 API 구현을 넣지 않는다.

## 경로 규칙
- 상대경로 과다(`../../../`)는 리팩터링 후보.
- 경로 수정 시 우선 `MainRouter`와 해당 page import부터 확인.

## 변경 체크 포인트
1. 라우트 파일(`src/app/router/MainRouter.jsx`) import 깨짐 여부
2. page -> domain 참조만 남았는지 여부
3. shared가 도메인 의존을 가지지 않는지 여부
