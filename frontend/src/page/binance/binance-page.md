# Binance Page — 구조 문서

## 파일 위치

```
frontend/src/page/binance/
├── BinancePage.jsx              ← 메인 페이지 (컨테이너, 상태 관리)
└── BinancePage.module.css       ← CSS 모듈 (반응형, 탭, LIVE 도트 등)

frontend/src/domain/binance/ui/
├── ticker/
│   ├── BinanceTicker.tsx        ← 데스크탑 시세 카드 (3열 그리드)
│   └── BinanceTickerMobile.tsx  ← 모바일 시세 카드 (세로 스택)
└── wallet/
    └── BinanceWallet.tsx        ← 지갑 잔고 카드
```

---

## 전체 레이아웃 (ASCII Wireframe)

### 데스크탑

```
┌────────────────────────────────────────────────────────────────┐
│  Header (공통 레이아웃)                                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  14:30:05 기준                          Binance × Upbit        │  ← 페이지 헤더
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │  [BTC] [ETH] [SOL] [XRP]          ● LIVE  1 USDT = ₩XXX │  │  ← 시세 카드
│ │                                                          │  │
│ │  BTC / USDT                                              │  │
│ │                                                          │  │
│ │  [현재가]      [업비트 KRW]     [변동률]                  │  │
│ │  $97,000.00    ₩140,650,000    +0.357%                   │  │
│ │                                                          │  │
│ │  프리미엄: +0.58% (김치프리미엄)                          │  │
│ │                                                          │  │
│ │  고가(24H)  저가(24H)  매수호가    매도호가    VWAP       │  │
│ │  거래량(BTC)  거래대금(USDT)  체결 횟수                   │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │  보유 잔고                                               │  │
│ │  코인   보유량    평가금액                                 │  │
│ │  BTC    0.0124   $1,202.80                               │  │  ← 지갑 카드
│ │  ETH    0.5000   $1,850.00                               │  │
│ │  ...                                                     │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Footer (TypeScript, WebSocket, Binance API, Axios)            │
└────────────────────────────────────────────────────────────────┘
```

### 모바일

```
┌────────────────────────────────┐
│  Header                        │
├────────────────────────────────┤
│  14:30:05 기준    Binance×Upbit│  ← 페이지 헤더
├────────────────────────────────┤
│ ┌──────────────────────────┐   │
│ │ [BTC][ETH][SOL][XRP]     │   │  ← 탭 (가로 스크롤)
│ │               ● LIVE     │   │
│ │               1USDT=₩XXX │   │
│ │                          │   │
│ │  고가: $97,500.00         │   │
│ │  $97,000.00  ▲+0.357%    │   │  ← BinanceTickerMobile
│ │  저가: $96,200.00         │   │
│ │                          │   │
│ │  업비트 ₩140,650,000       │   │
│ │  프리미엄 +0.58%           │   │
│ │                          │   │
│ │  고가  저가  매수  매도  VWAP│   │
│ │  거래량  거래대금  체결수   │   │
│ └──────────────────────────┘   │
│ ┌──────────────────────────┐   │
│ │  보유 잔고                │   │
│ │  BTC  0.0124  $1,202.80  │   │  ← BinanceWallet
│ │  ...                     │   │
│ └──────────────────────────┘   │
├────────────────────────────────┤
│  Footer                        │
└────────────────────────────────┘
```

---

## 컴포넌트별 Props & 동작

---

### BinancePage.jsx
> 데이터 수집 + 상태 관리 컨테이너. 직접 UI를 그리지 않고 자식 컴포넌트에 데이터 전달.

| 상태 | 타입 | 설명 |
|---|---|---|
| `selectedSymbol` | string | 현재 선택된 코인 심볼 (기본: `BTCUSDT`) |
| `accountInfo` | object\|null | REST API 지갑 잔고 데이터 |
| `walletLoading` | boolean | 지갑 API 호출 중 여부 |
| `walletError` | string\|null | 지갑 API 에러 메시지 |
| `serverError` | string\|null | 5xx/네트워크 오류 코드 (ErrorPage 인라인 렌더용) |
| `savedHeight` | number\|null | 시세 카드 높이 저장값 (스켈레톤 시 고정용) |

**코인 목록 (`COINS` — BinancePage.jsx 상단 단일 수정 포인트)**

| symbol | code | label | upbitCode |
|---|---|---|---|
| BTCUSDT | BTC | BTC / USDT | KRW-BTC |
| ETHUSDT | ETH | ETH / USDT | KRW-ETH |
| SOLUSDT | SOL | SOL / USDT | KRW-SOL |
| XRPUSDT | XRP | XRP / USDT | KRW-XRP |

> 코인 추가 시 `COINS` 배열만 수정하면 탭·시세·업비트 연동 자동 반영.
> `upbitCode: null`이면 KRW 블록 전체 숨김.

**LIVE 도트 상태**

| status | 색 | 도트 | 텍스트 |
|---|---|---|---|
| `connected` | `#2ecc71` (초록) | 깜빡임 | LIVE |
| `connecting` | `#f39c12` (주황) | 없음 | 연결 중... |
| `disconnected` | `#e74c3c` (빨강) | 없음 | 연결 끊김 |

---

### BinanceTicker.tsx (데스크탑, >768px)
> WebSocket 시세 카드 — 3열 그리드 레이아웃

| Prop | 타입 | 설명 |
|---|---|---|
| `ticker` | BinanceTickerData\|null | WS 시세 데이터 (null=스켈레톤) |
| `upbitTicker` | UpbitTickerData\|undefined\|null | 업비트 KRW 시세 |
| `usdtKrwTicker` | UpbitTickerData\|null | KRW-USDT 환율 |
| `pairLabel` | string | 거래쌍 라벨 (예: `BTC / USDT`) |

**표시 필드 (WebSocket ticker)**

| 필드 | 설명 |
|---|---|
| `ticker.c` | 현재가 |
| `ticker.P` | 변동률 (%) |
| `ticker.p` | 변동 금액 |
| `ticker.h` | 24H 고가 |
| `ticker.l` | 24H 저가 |
| `ticker.b` | 매수호가 (Bid) |
| `ticker.a` | 매도호가 (Ask) |
| `ticker.w` | VWAP (가중평균가) |
| `ticker.v` | 24H 거래량 (BTC) |
| `ticker.q` | 24H 거래대금 (USDT) |
| `ticker.n` | 24H 체결 횟수 |

> `ticker === null`이면 shimmer 스켈레톤 표시 (savedHeight로 카드 크기 고정)

---

### BinanceTickerMobile.tsx (모바일, ≤768px)
> 세로 스택 레이아웃 (고가/현재가/저가 순, 프리미엄, InfoBox)

> BinanceTicker.tsx의 3열 그리드는 inline style로 고정되어 media query 오버라이드 불가 → 별도 파일로 분리.
> BinancePage.jsx에서 `.pcOnly`/`.mobileOnly` CSS 클래스로 전환.

---

### BinanceWallet.tsx
> 지갑 잔고 카드 — REST API 1회 조회, 보유 코인 목록 표시

| Prop | 타입 | 설명 |
|---|---|---|
| `accountInfo` | object\|null | 바이낸스 계좌 잔고 데이터 |
| `loading` | boolean | 로딩 중 여부 (스켈레톤) |
| `error` | string\|null | 에러 메시지 |

---

## 데이터 흐름

```
WebSocket (Spring Boot /ws/binance-price?symbol=...)
  └── useBinanceWebSocket(selectedSymbol) → ticker, status

WebSocket (업비트 wss://api.upbit.com)
  └── useUpbitWebSocket([selectedCoin.upbitCode, 'KRW-USDT'])
        → upbitTickers { 'KRW-BTC': {...}, 'KRW-USDT': {...} }

REST API
  └── GET /api/binance/account → accountInfo (1회)
```

---

## 패널 크기 고정 메커니즘

ticker가 null(스켈레톤)일 때 시세 카드가 줄어드는 현상 방지:
1. `ticker !== null`일 때 `tickerWrapperRef.current.offsetHeight/Width` 측정 → `savedHeight/Width` 저장
2. `ticker === null`일 때 `minHeight/minWidth`로 저장값 적용
3. `ticker`가 다시 non-null → 제약 해제, 실데이터가 높이 결정

## 서버 에러 처리

- 5xx / 네트워크 단절: `walletLoading=true` 유지 + `serverError` 세팅 → `<ErrorPage />` 인라인 렌더
- Nginx `proxy_intercept_errors` 대응: `Content-Type`이 `application/json`이 아니면 502로 처리
- 4xx: `walletError` 세팅 + 에러 메시지 표시 (페이지 유지)
