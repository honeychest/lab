# Trade Page — 구조 문서

## 파일 위치

```
frontend/src/page/trade/
├── TradePage.jsx              ← 메인 페이지
├── TradePanel.tsx             ← 조회 사이드 패널 (Sheet)
├── TickTable.jsx              ← 실시간 틱 테이블
└── TradePage.module.css       ← scanBeam / scrollbarClip 애니메이션

frontend/src/domain/binance/model/hook/
├── useBinanceTradeSse.ts      ← 대형체결 SSE + 초기 100건 로드
└── useRawTickSse.ts           ← 원시 틱 SSE
```

---

## 전체 레이아웃 (ASCII Wireframe)

### 데스크탑 (md 이상)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                           [ B T C ]          [조회 버튼]                  │
│                         (InputOTP 디스플레이)                             │
│                                                                          │
├──────────────────────────────────────────────┬───────────────────────────┤
│                                              │                           │
│  ┌──────────────────────────────────────┐    │  ┌─────────────────────┐  │
│  │  ○ 감시중   XXX,XXX / XXX,XXX USD 이상│    │  │  매수 BTC  매도 BTC  │  │
│  │           [── scanBeam 애니메이션 ──] │    │  │  0.0000    0.0000   │  │
│  └──────────────────────────────────────┘    │  └─────────────────────┘  │
│                                              │                           │
│  ┌──────────────────────────────────────┐    │  ┌─────────────────────┐  │
│  │ 체결시각 │시장│방향│금액USD│금액원│가격│경과│    │  │F/S │  가격  │ 수량 │  │
│  ├──────────┼────┼────┼───────┼────┼───┼───┤    │  ├────┼────────┼──────┤  │
│  │ 14:32:10 │ F  │매수│$1.2M  │16억│...│방금│   │  │ F  │ 70,290 │0.0012│  │
│  │          │    │    │(Skeleton 500ms)     │    │  │ S  │ 70,289 │0.0004│  │
│  │ 14:31:55 │ S  │매도│$800K  │11억│...│1분전│  │  │ F  │ 70,291 │0.0020│  │
│  │ ...      │    │    │       │    │   │    │    │  │ ...│        │      │  │
│  │          │    │    │       │    │   │    │    │  │    │        │      │  │
│  │  (최대 100건, 스크롤바 클리핑)         │    │  │  (실시간 틱 스트림)  │  │
│  └──────────────────────────────────────┘    │  └─────────────────────┘  │
│                                              │                           │
│           큰거래 테이블 (flex-1)               │   틱 테이블 (w-3/18)       │
└──────────────────────────────────────────────┴───────────────────────────┘

                                              ┌────────────────────┐
                   [조회 버튼 클릭 시 →]        │  체결 조회 (Sheet)   │
                                              │                    │
                                              │  심볼   [BTCUSDT▼] │
                                              │  시장   [전체   ▼] │
                                              │  방향   [전체   ▼] │
                                              │  날짜   [──────]  │
                                              │  정렬   [최신순 ▼] │
                                              │  [조회]            │
                                              │  ──────────────── │
                                              │  결과 테이블        │
                                              │  (페이지네이션)     │
                                              └────────────────────┘
```

### 모바일 (md 미만)

```
┌──────────────────────────┐
│      [ B T C ]           │
│                          │
│  ○ 감시중  XXX/XXX 이상   │
│  [── scanBeam ──────]    │
│                          │
│  ┌──────────────────┐    │
│  │ FUTURES  매수     │    │
│  │ $70,290  $1.2M   │    │
│  │ 0.0170 BTC  방금  │    │
│  └──────────────────┘    │
│  ┌──────────────────┐    │
│  │ SPOT     매도     │    │
│  │ ...               │    │
│  └──────────────────┘    │
│  ...                     │
│  [shimmer skeleton]      │ ← 무한스크롤 로딩
│  [div IntersectionObs]   │ ← 뷰포트 진입 시 loadMore
└──────────────────────────┘
```

---

## 컴포넌트별 Props & 옵션

---

### TradePage.jsx
> 상태 관리 + 레이아웃 조립. 직접 수정보다는 하위 컴포넌트 수정 권장.

**내부 상태**

| 상태 | 타입 | 설명 |
|---|---|---|
| `threshold` | number\|null | 대형체결 감지 기준값 (USD) |
| `canEditThreshold` | boolean | 허용 IP에서만 true (수정 권한) |
| `isPanelOpen` | boolean | 조회 Sheet 오픈 여부 |
| `tickTotals` | `{buy, sell}` | 페이지 생명주기 동안 틱 누적 수량 (BTC) |
| `newTradeIds` | Set | 신규 체결 skeleton 표시용 ID 집합 (500ms) |
| `isLoadingMore` | boolean | 모바일 무한스크롤 로딩 중 |

**포맷 유틸 (파일 상단)**

| 함수 | 설명 |
|---|---|
| `formatThreshold(v)` | 기준값 → `XXX,XXX / XXX,XXX USD` (선물/현물 분리) |
| `formatTime(tradedAt)` | ms → `HH:MM:SS` (Asia/Seoul) |
| `formatPrice(v)` | 소수점 2자리 가격 |
| `formatQty(v)` | 소수점 4자리 수량 |
| `formatValue(v)` | `$1.2M` / `$800K` 약식 |
| `getElapsed(tradedAt)` | `방금` / `N분 전` / `N시간 전` / `N일 전` |
| `formatKrw(usdValue)` | USD → 원화 (`USD_KRW_RATE = 1450` 하드코딩) |

> 환율 변경 시: 파일 상단 `USD_KRW_RATE = 1450` 수정

---

### useBinanceTradeSse.ts
> 대형체결 SSE 훅. TradePage에서 import.

**반환값**

| 값 | 타입 | 설명 |
|---|---|---|
| `trades` | `TradeEntry[]` | 체결 목록 (데스크탑 최대 100건) |
| `scanState` | `'watching' \| 'expanding' \| 'reconnecting'` | 스캔 슬롯 상태 |
| `initError` | boolean | 초기 100건 로드 실패 여부 |
| `loadMore(oldestId, size)` | fn | 모바일 무한스크롤 추가 로드 |

**TradeEntry 구조**

```ts
{
  id: number
  symbol: string          // 'BTCUSDT'
  marketType: 'SPOT' | 'FUTURES'
  price: string
  quantity: string
  tradeValue: string      // USD 환산값
  isBuyerMaker: boolean   // true = 매도
  tradedAt: number        // ms timestamp
}
```

**scanState 동작**

| 상태 | 표시 | 조건 |
|---|---|---|
| `watching` | `○ 감시중` + scanBeam 애니메이션 | 평상시 |
| `expanding` | `● 체결 감지` + 파란 배경 | 신규 체결 수신 후 500ms |
| `reconnecting` | `재연결 중...` 노란색 | SSE 연결 끊김 |

**API 연결**

| API | 설명 |
|---|---|
| `GET /api/binance/trades/recent?limit=100` | 초기 100건 로드 |
| `SSE /api/binance/trades/sse` | 실시간 신규 체결 수신 |
| `GET /api/binance/trades?cursor=&size=` | 무한스크롤 추가 로드 |

---

### useRawTickSse.ts
> 원시 틱 SSE 훅. 모든 체결 틱 수신.

**반환값**

| 값 | 타입 | 설명 |
|---|---|---|
| `ticks` | `TickEntry[]` | 실시간 틱 목록 |
| `isConnecting` | boolean | 연결 중 여부 |

**TickEntry 구조**

```ts
{
  price: string
  quantity: string
  isBuyerMaker: boolean   // true = 매도
  marketType: 'SPOT' | 'FUTURES'
}
```

---

### TickTable.jsx
> 실시간 틱 테이블 (우측 패널)

| Prop | 타입 | 설명 |
|---|---|---|
| `ticks` | `TickEntry[]` | 틱 목록 |
| `isConnecting` | boolean | 연결 중이면 `수신중...` 표시 |

> 가격 색: `isBuyerMaker=false`(매수) → 초록 / `true`(매도) → 빨강

---

### TradePanel.tsx
> 조회 사이드 패널 (shadcn Sheet 내부)

| Prop | 타입 | 설명 |
|---|---|---|
| `threshold` | number\|null | 현재 기준값 |
| `canEditThreshold` | boolean | 수정 권한 (허용 IP) |
| `onThresholdChange` | fn | 기준값 변경 콜백 |
| `onClose` | fn | Sheet 닫기 콜백 |

**필터 옵션**

| 필터 | 선택지 |
|---|---|
| 심볼 | BTCUSDT / ENAUSDT 등 |
| 시장 | 전체 / FUTURES / SPOT |
| 방향 | 전체 / 매수 / 매도 |
| 날짜 | 날짜 직접 입력 |
| 정렬 | 최신순 / 오래된순 |

**API 연결**

```
GET /api/binance/trades?symbol=&marketType=&direction=&date=&sort=&page=&size=
GET /api/binance/trades/threshold          ← 기준값 조회
PUT /api/binance/trades/threshold          ← 기준값 수정 (허용 IP만)
```

---

### TradePage.module.css
> CSS 모듈. 클래스명은 빌드 시 해시화됨.

| 클래스 | 설명 |
|---|---|
| `.scanBeam` | 스캔 슬롯 좌→우 빛 애니메이션 |
| `.scrollbarClip` | 틱 테이블 스크롤바 숨김 (overflow clip) |
| `.scrollbarClipWide` | 큰거래 테이블 스크롤바 숨김 |
| `.newRow` | 신규 체결 행 진입 애니메이션 |

---

## 데이터 흐름

```
SSE (/api/binance/trades/sse)
  └── useBinanceTradeSse → trades[]
        └── TradePage (큰거래 테이블)

REST (/api/binance/trades/recent)
  └── useBinanceTradeSse → 초기 100건 세팅

SSE (raw tick SSE)
  └── useRawTickSse → ticks[]
        ├── TickTable (틱 테이블 렌더)
        └── TradePage (tickTotals 누적 — 매수/매도 BTC 합계)

REST (/api/binance/trades/threshold)
  └── TradePage → threshold, canEditThreshold

REST (/api/binance/trades — 페이지네이션)
  └── TradePanel (조회 사이드 패널)
```

---

## 주요 수정 포인트

| 수정 목적 | 파일 | 위치 |
|---|---|---|
| 환율 변경 | `TradePage.jsx` | `USD_KRW_RATE = 1450` |
| 데스크탑 최대 건수 | `useBinanceTradeSse.ts` | `DESKTOP_MAX = 100` |
| 신규 체결 skeleton 시간 | `useBinanceTradeSse.ts` | `ANIMATION_MS = 500` |
| SSE 재연결 딜레이 | `useBinanceTradeSse.ts` | `RECONNECT_DELAY_MS = 1_000` |
| 스캔 슬롯 애니메이션 | `TradePage.module.css` | `.scanBeam` |
| 조회 필터 추가 | `TradePanel.tsx` | 필터 Select 컴포넌트 |
| 틱 테이블 컬럼 | `TickTable.jsx` | TableHead / TableCell |
