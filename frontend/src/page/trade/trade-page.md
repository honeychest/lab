# Trade Page — 구조 문서

## 파일 위치

```
frontend/src/page/trade/
├── TradePage.jsx        ← 메인 페이지 (상태 관리, 레이아웃 분기)
├── TickTable.jsx        ← 실시간 틱 테이블 (우측 패널)
└── TradePanel.tsx       ← 조회 사이드 패널 (Sheet 슬라이드)
```

---

## 전체 레이아웃 (ASCII Wireframe)

### 데스크탑

```
col→  좌(flex:1)                               우(w-3/18)
     ┌──────────────────────────────────────┬──────────────────┐
     │                                      │                  │
     │           [ B  T  C ]                │                  │  ← 헤더 (전체 너비)
     │                         [조회] 버튼  │                  │
     │                                      │                  │
     ├──────────────────────────────────────┼──────────────────┤
     │ ── 스캔 슬롯 ──────────────────────  │  매수 BTC  매도 BTC│  ← 40px
     │ ○ 감시중   XXX,XXX / XXX USD 이상   │  0.0000   0.0000 │
     │ (체결 감지: ● 체결 감지, 파란빛)     │                  │
     ├──────────────────────────────────────┼──────────────────┤
     │ 체결시각  시장  방향  금액(USD)        │ [F] 가격    수량 │
     │                 금액(원)  가격  경과  │ [S] 가격    수량 │
     │ ─────────────────────────────────── │ [F] 가격    수량 │
     │ 14:30:00  FUTURES  매수  $1.2M       │ ...              │
     │           1,740,000원  $97,000  방금 │                  │
     │ 14:29:55  SPOT     매도  $800K       │ (실시간 틱 스크롤)│
     │           1,160,000원  $96,980  방금 │                  │
     │ ...                                  │                  │
     │ (스크롤 없음, overflow:hidden)        │                  │
     └──────────────────────────────────────┴──────────────────┘
```

### 모바일

```
     ┌────────────────────────────────────────┐
     │           [ B  T  C ]                  │  ← 헤더 (중앙)
     │                         [조회] 버튼   │
     ├────────────────────────────────────────┤
     │  ○ 감시중   XXX,XXX / XXX USD 이상    │  ← 스캔 슬롯
     ├────────────────────────────────────────┤
     │  [FUTURES] 매수               14:30:00 │
     │  $97,000.00                     $1.2M  │  ← 카드 1개
     │  0.0124 BTC                     방금  │
     ├────────────────────────────────────────┤
     │  [SPOT]    매도               14:29:55 │
     │  $96,980.00                     $800K  │  ← 카드 N개 (무한스크롤)
     │  0.0082 BTC                     방금  │
     ├────────────────────────────────────────┤
     │  (스크롤 끝 → skeleton 3개 → 20건 추가)│
     └────────────────────────────────────────┘
```

### 조회 사이드 패널 (Sheet — 우측 슬라이드)

```
                         ┌──────────────────────┐
                         │  체결 조회        ✕  │
                         ├──────────────────────┤
                         │  심볼    [BTCUSDT ▼] │
                         │  시장    [전체    ▼] │
                         │  방향    [전체    ▼] │
                         │  날짜    [________]  │
                         │  정렬    [최신순  ▼] │
                         │          [조회하기]  │
                         ├──────────────────────┤
                         │  총 XXX건             │
                         │  체결시각  방향   금액 │
                         │  14:30    매수  $1.2M │
                         │  14:25    매도   $900K│
                         │  ...                  │
                         │  [이전]  1 / 5  [다음]│
                         └──────────────────────┘
```

---

## 컴포넌트별 Props & 동작

---

### TradePage.jsx
> 상태 관리 + 레이아웃 분기 (데스크탑/모바일). 수정할 게 없으면 건드리지 않는다.

| 상태 | 타입 | 설명 |
|---|---|---|
| `trades` | array | 대형 체결 목록 (SSE 실시간 + 초기 로드, 최대 200건 cap) |
| `scanState` | string | 스캔 슬롯 상태: `idle` / `expanding` / `reconnecting` |
| `initError` | boolean | 초기 SSE 연결 실패 여부 |
| `ticks` | array | 실시간 틱 목록 (RawTick SSE) |
| `isTickConnecting` | boolean | 틱 SSE 재연결 중 여부 |
| `threshold` | number\|null | 대형 체결 기준 금액 (USD, FUTURES 기준) |
| `canEditThreshold` | boolean | 임계값 수정 권한 (허용 IP에서만 true) |
| `isPanelOpen` | boolean | 조회 사이드 패널 오픈 여부 |
| `tickTotals` | `{buy, sell}` | 페이지 생명주기 동안 누적 매수/매도 BTC 수량 |
| `newTradeIds` | Set | 신규 체결 ID (500ms skeleton 표시 후 제거) |

**포맷 함수 (TradePage.jsx 상단)**

| 함수 | 설명 | 출력 예 |
|---|---|---|
| `formatThreshold` | FUTURES / SPOT 기준 표시 | `1,000,000 / 500,000 USD` |
| `formatTime` | KST 시:분:초 | `14:30:05` |
| `formatPrice` | 소수점 2자리 | `97,000.00` |
| `formatValue` | M/K 단위 축약 | `$1.2M` / `$800K` |
| `getElapsed` | 경과 시간 | `방금` / `5분 전` / `2시간 전` |
| `formatKrw` | USD→KRW 환산 (고정 1450) | `1,740,000원` |

---

### TickTable.jsx
> 실시간 틱 스트림 테이블 (우측 좁은 패널)

| Prop | 타입 | 설명 |
|---|---|---|
| `ticks` | array | RawTick 배열 |
| `isConnecting` | boolean | SSE 재연결 중 여부 |

```
ticks[n] = {
  marketType: 'FUTURES' | 'SPOT',
  price: string,
  quantity: string,
  isBuyerMaker: boolean   // true=매도, false=매수
}
```

> 컬럼: 시장 배지(F/S) | 가격(매수=초록/매도=빨강) | 수량
> 재연결 중: "수신중..." / 틱 없음: "틱 없음"

---

### TradePanel.tsx
> 조회 사이드 패널 — 필터 + 페이지네이션

| Prop | 타입 | 설명 |
|---|---|---|
| `threshold` | number\|null | 현재 기준 금액 |
| `canEditThreshold` | boolean | 수정 권한 여부 |
| `onThresholdChange` | fn | 기준값 변경 콜백 |
| `onClose` | fn | 패널 닫기 콜백 |

**필터 옵션**

| 필드 | 선택지 |
|---|---|
| 심볼 | BTCUSDT |
| 시장 | 전체 / SPOT / FUTURES |
| 방향 | 전체 / 매수 / 매도 |
| 날짜 | date input |
| 정렬 | 최신순 / 오래된순 |

> 페이지당 20건, 총 건수 + 이전/다음 네비게이션

---

## 데이터 흐름

```
SSE (/api/binance/trades/sse)
  └── useBinanceTradeSse → trades, scanState, initError, loadMore

SSE (/api/binance/raw-tick/sse)
  └── useRawTickSse → ticks, isConnecting

REST API
  ├── GET /api/binance/trades/threshold → threshold, canEditThreshold
  └── GET /api/binance/trades?symbol=&marketType=&... (TradePanel 내부)
        → content[], totalElements, totalPages, page, size
```

---

## 스캔 슬롯 동작

| 상태 | 표시 | 스타일 |
|---|---|---|
| `idle` | `○ 감시중  XXX,XXX / XXX USD 이상` + 스캔 빔 애니메이션 | 어두운 배경 |
| `expanding` | `● 체결 감지` | `bg-blue-950/30` 파란빛 전환 |
| `reconnecting` | `재연결 중...` | 노란 텍스트 |

> 스캔 빔: `scanBeam` CSS 애니메이션 — 좌→우 빛 줄기 무한 반복

---

## 신규 체결 Skeleton

신규 체결 진입 시 500ms 동안 skeleton 표시 후 `newRow` 애니메이션으로 등장:
- 데스크탑: 각 TableCell에 shimmer bar
- 모바일: 카드 전체 3줄 shimmer
