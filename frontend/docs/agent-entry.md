# Agent Entry Map

## 목적
- AI가 `frontend` 분석을 시작할 때 가장 먼저 볼 파일을 고정한다.
- 불필요한 전체 탐색을 줄인다.

## 앱 진입 흐름
1. `index.html` -> `/src/app/main.jsx`
2. `src/app/main.jsx` -> `src/app/App.jsx`
3. `src/app/App.jsx` -> `src/app/router/MainRouter.jsx`

## 라우트 맵
- `/` -> `src/page/binance/BinancePage.jsx`
- `/cesium` -> `src/page/weather/CesiumPage.jsx`
- `/app` -> `/cesium` redirect
- `/test` -> `src/page/error/TestTest.jsx`
- `/error-test` (dev only) -> `src/page/error/ErrorTest.tsx`
- `*` -> `src/page/error/ErrorPage.tsx`

## 먼저 볼 파일 TOP 10
1. `src/app/router/MainRouter.jsx`
2. `src/page/binance/BinancePage.jsx`
3. `src/page/weather/CesiumPage.jsx`
4. `src/page/error/ErrorPage.tsx`
5. `src/domain/binance/model/hooks/useBinanceWebSocket.ts`
6. `src/domain/binance/model/hooks/useUpbitWebSocket.ts`
7. `src/domain/weather/model/hook/useWeatherData.ts`
8. `src/domain/weather/model/hook/useCesiumMap.js`
9. `src/shared/ui/layout/Layout.jsx`
10. `src/domain/support/api/contactApi.js`

## 탐색 기본 원칙
- 위 순서로 먼저 확인하고, 필요 시에만 범위를 확장한다.
- 대규모 탐색은 `chs-rules.md` 승인 규칙을 따른다.
