# Public Assets Classification

## 목적
- `frontend/public`에 둘 파일을 최소 기준으로 관리한다.
- URL 직참조 자산과 번들 자산을 분리한다.

## 분류 기준

### must_public
- 런타임에서 절대 경로(`/...`)로 직접 로드하는 파일.
- Nginx/인프라가 직접 참조하는 파일.

### can_move_to_src
- React 코드에서 import 가능한 파일.
- 번들 최적화(해시, 경로 검증)를 받는 편이 유리한 파일.

### deployment_only
- 앱 코드에서는 직접 참조하지 않지만 운영 환경에서 필요한 파일.

## 현재 분류 (2026-03-04)

### must_public
- `public/data/korea.json`
  - 사용 코드: `Cesium.GeoJsonDataSource.load("/data/korea.json")`
  - 참조 파일: `src/domain/weather/model/hook/useCesiumMap.js`
- `public/lottie/alert.json`
  - 사용 코드: `const alertAnim = '/lottie/alert.json'`
  - 참조 파일: `src/page/error/ErrorPage.tsx`
- `public/lottie/denyX.json`
  - 사용 코드: `const denyAnim = '/lottie/denyX.json'`
  - 참조 파일: `src/page/error/ErrorPage.tsx`

### deployment_only
- `public/50x.html`
  - 앱 코드 직접 참조 없음
  - 운영(Nginx 에러 페이지) 목적 파일

### can_move_to_src (또는 유지)
- `public/vite.svg`
  - 현재 `index.html` favicon으로 사용 중
  - 제품 아이콘 적용 전까지 유지 가능

## 운영 규칙
- URL 직참조 파일만 `public`에 둔다.
- import 가능한 자산은 `src/shared/asset` 우선 배치한다.
- `public` 신규 파일 추가 시 분류 사유를 이 문서에 기록한다.

## TODO
- `vite.svg` 교체 또는 유지 확정
- `50x.html` 운영 사용 여부 최종 확정
- `korea.json` 경량화 필요 여부 점검
