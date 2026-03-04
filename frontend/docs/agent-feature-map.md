# Agent Feature Map

## domain/binance
- `ui/ticker`: `BinanceTicker.tsx`, `BinanceTickerMobile.tsx`
- `ui/wallet`: `BinanceWallet.tsx`
- `model/hooks`: `useBinanceWebSocket.ts`, `useUpbitWebSocket.ts`
- page 연결: `src/page/binance/BinancePage.jsx`
- 연관 확인 파일: `BinancePage.module.css`, `shared/ui/layout/Layout.jsx`

## domain/weather
- `ui/map`: `CesiumMap.jsx`
- `ui/panel`: `WeatherPanel.jsx`
- `ui/detail`: `WeatherDetail.tsx`
- `model/hook`: `useCesiumMap.js`, `useWeatherData.ts`
- `lib`: `weatherUtils.js`
- page 연결: `src/page/weather/CesiumPage.jsx`
- 연관 확인 파일: `entity/weather/model/regions.ts`, `entity/weather/lib/weatherUtils.ts`

## domain/support
- `api`: `contactApi.js`
- 사용처: `shared/ui/layout/Layout.jsx`, `shared/ui/feedback/TelegramPopup.jsx`

## 주의 포인트
- weather util 중복 가능성: `domain/weather/lib/weatherUtils.js` vs `entity/weather/lib/weatherUtils.ts`
- hook 폴더 네이밍 불일치 가능성: `hook`/`hooks`

## 수정 우선순위 가이드
1. page 오류 -> 해당 page + 연결된 domain model/hook 확인
2. 실시간 데이터 오류 -> binance/weather model hook 확인
3. 문의/팝업 오류 -> support api + shared feedback/layout 확인
