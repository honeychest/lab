# Binance Page

## 구조

```text
frontend/src/page/binance/
├── BinancePage.jsx
├── BinancePage.module.css
├── model/
│   ├── binancePageView.js
│   ├── binanceTickerCardStyles.js
│   └── binanceTickerCardView.js
└── ui/
    ├── BinancePageHeader.jsx
    ├── BinanceTickerCard.jsx
    ├── BinanceTickerCard.module.css
    └── BinanceWalletCard.jsx

frontend/src/domain/binance/model/
├── display/binanceTickerDisplayModel.js
├── hook/
│   ├── useBinanceWallet.js
│   ├── useBinanceWebSocket.ts
│   ├── useTickerPanelStability.js
│   └── useUpbitWebSocket.ts
├── market/binanceMarketSelection.js
├── panel/tickerPanelStability.js
├── status/binanceLiveStatus.js
└── wallet/
    ├── binanceWalletLoadPolicy.js
    └── binanceWalletState.js
```

## Module 책임

### `BinancePage.jsx`

Page shell Module.

- 선택 market 상태 보관
- Binance/Upbit/wallet Hook 조합
- 서버 오류 gate
- `BinancePageHeader`, `BinanceTickerCard`, `BinanceWalletCard` 배치

직접 계산하지 않음:

- premium / 표시 문자열
- wallet 오류 분기
- panel minimum size
- live status 색/깜빡임
- market fallback / Upbit subscription codes

### Page UI Modules

| Module | 역할 |
|---|---|
| `BinancePageHeader.jsx` | `Binance × Upbit` header 표시 |
| `BinanceTickerCard.jsx` | coin tabs, live status, ticker desktop/mobile switch |
| `BinanceWalletCard.jsx` | wallet card frame + `BinanceWallet` 전달 |

### Domain Model Modules

| Module | Interface |
|---|---|
| `binanceTickerDisplayModel.js` | ticker 표시 계산, premium 계산, formatter |
| `binanceMarketSelection.js` | market catalog, selected market fallback, Upbit codes |
| `binanceLiveStatus.js` | live dot/text/fill/blink/transition 계산 |
| `tickerPanelStability.js` | skeleton 전환 시 min size style 계산 |
| `binanceWalletLoadPolicy.js` | wallet HTTP response/error 분류 |
| `binanceWalletState.js` | wallet outcome → page state 전이 |

### Hooks

| Hook | 역할 |
|---|---|
| `useBinanceWebSocket(selectedSymbol)` | Binance ticker stream |
| `useUpbitWebSocket(codes)` | Upbit KRW ticker stream |
| `useBinanceWallet()` | wallet fetch + wallet state |
| `useTickerPanelStability(ticker)` | DOM 측정 + panel minimum size style |

## 데이터 흐름

```text
selectedSymbol
  └── useBinanceWebSocket(selectedSymbol)
        └── ticker, status

selectedSymbol
  └── getSelectedBinanceMarket(...)
        └── selectedCoin
              └── getUpbitSubscriptionCodes(...)
                    └── useUpbitWebSocket(codes)
                          └── upbitTicker, usdtTicker

useBinanceWallet()
  └── accountInfo, walletLoading, walletError, serverError
```

## 표시 계산 흐름

```text
BinanceTicker / BinanceTickerMobile
  └── buildBinanceTickerDisplayModel(...)
        ├── premium
        ├── premiumRate
        ├── price color/sign
        └── shared formatter values
```

## Wallet 오류 정책

- HTML fallback response → `502`
- 네트워크 오류 / `5xx` → server error
- `4xx` → wallet card error
- server error 시 page는 wallet loading gate를 유지하고 `ErrorPage` 렌더

## Panel 안정화

```text
useTickerPanelStability(ticker)
  ├── 실데이터 렌더 시 wrapper size 저장
  └── ticker === null 시 minHeight/minWidth 적용
```

## 테스트 표면

현재 pure Module 테스트:

- `binanceTickerDisplayModel.test.mjs`
- `binanceWalletLoadPolicy.test.mjs`
- `binanceWalletState.test.mjs`
- `binanceMarketSelection.test.mjs`
- `tickerPanelStability.test.mjs`
- `binanceLiveStatus.test.mjs`
- `binanceTickerCardView.test.mjs`
- `binanceTickerCardStyles.test.mjs`
- `binancePageView.test.mjs`
