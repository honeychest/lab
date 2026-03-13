# Signal Dashboard — 구조 문서

## 파일 위치

```
frontend/src/page/signal/
├── SignalPage.jsx           ← 메인 페이지 (상태 관리, 그리드 레이아웃)
├── TopBar.jsx
├── LongPanel.jsx
├── ShortPanel.jsx
├── ShortLiqPanel.jsx
├── LiquidationPanel.jsx
├── MainCore.jsx
│   ├── EnergyGauge.jsx
│   ├── TugOfWar.jsx
│   └── MiniChartPlaceholder.jsx
│       └── OiLineChart.jsx
└── PatternStrip.jsx
```

---

## 전체 레이아웃 (ASCII Wireframe)

그리드: `12컬럼 × 4행`
행 높이: `44px | 1fr | 0.6fr | 440px`

```
col→  1    2    3    4    5    6    7    8    9   10   11   12
     ┌────────────────────────────────────────────────────────┐ ← 44px  (row 1)
     │                                                        │
     │                      TopBar.jsx                        │
     │  [BTC] [ENA]    [1m][5m][30m][1h]        [펀딩레이트]  │
     │                                                        │
     ├──────────────┬─────────────────────────┬───────────────┤ ← 1fr   (row 2)
     │              │                         │               │
     │  LongPanel   │                         │  ShortPanel   │
     │              │                         │               │
     │  LONG ENERGY │                         │  SHORT ENERGY │
     │  $XXX,XXX    │                         │  $XXX,XXX     │
     │              │       MainCore.jsx       │               │
     │  [F] 가격 수량│                         │  [F] 가격 수량│
     │  [F] 가격 수량│   ┌─────────────────┐   │  [F] 가격 수량│
     │  [S] 가격 수량│   │   EnergyGauge   │   │  [S] 가격 수량│
     │  ...         │   │   (ECharts 게이지)│  │  ...         │
     │              │   │   Long / Short  │   │               │
     │              │   └─────────────────┘   │               │
     │              │   ── TugOfWar ──────    │               │
     ├──────────────┤   ● ─────────── ●       ├───────────────┤ ← 0.6fr (row 3)
     │              │                         │               │
     │ ShortLiqPanel│   ┌──┬───────────┬──┐   │ Liquidation   │
     │              │   │  │오픈포지션 │  │   │  Panel.jsx    │
     │  숏 청산 목록 │   │SPOT│볼륨(OI차트)│SPREAD│  롱 청산 목록│
     │  SHORT LIQ   │   │  │OiLineChart│  │   │  LONG LIQ    │
     │  $X,XXX      │   └──┴───────────┴──┘   │  $X,XXX      │
     │  ─────────── │   MiniChartPlaceholder   │  ───────────  │
     │  누계 $X,XXX  │                         │  누계 $X,XXX  │
     │              │                         │               │
     ├──────────────┴─────────────────────────┴───────────────┤ ← 440px (row 4)
     │                                                        │
     │                    PatternStrip.jsx                    │
     │  [유사패턴1] [유사패턴2] [유사패턴3] [유사패턴4] [...]  │
     │                                                        │
     └────────────────────────────────────────────────────────┘
```

---

## 컴포넌트별 Props & 옵션

---

### SignalPage.jsx
> 상태 관리 + 그리드 조립. 수정할 게 없으면 건드리지 않는다.

| 상태 | 타입 | 설명 |
|---|---|---|
| `symbol` | string | 현재 심볼 (BTCUSDT / ENAUSDT) |
| `timeRange` | string | 선택된 봉 단위 (1m / 5m / 30m / 1h) |
| `longEnergy` | number | 롱 누적 에너지 (USD) |
| `shortEnergy` | number | 숏 누적 에너지 (USD) |
| `longTrades` | array | 롱 체결 tape (최근 12개) |
| `shortTrades` | array | 숏 체결 tape (최근 12개) |
| `longLiqEvents` | array | 롱 청산 이벤트 목록 (최근 50개) |
| `shortLiqEvents` | array | 숏 청산 이벤트 목록 (최근 50개) |
| `longLiqTotal` | number | 롱 청산 누계 (USD) |
| `shortLiqTotal` | number | 숏 청산 누계 (USD) |
| `oiDataHistory` | array | OI 시계열 데이터 (최근 100개) |

**타임프레임 → 실제 조회 범위 매핑**

| 선택 | 실제 API 조회 |
|---|---|
| 1m | 5m |
| 5m | 30m |
| 30m | 1h |
| 1h | 4h |

---

### TopBar.jsx
> 심볼 탭 + 봉 단위 선택 + 펀딩레이트 표시

| Prop | 타입 | 설명 |
|---|---|---|
| `symbol` | string | 현재 선택 심볼 |
| `onSymbolChange` | fn | 심볼 변경 콜백 |
| `timeRange` | string | 현재 선택 봉 단위 |
| `onTimeRangeChange` | fn | 봉 단위 변경 콜백 |
| `fundingRate` | number\|null | 펀딩 비율 (0.01 = 1%) |

> 펀딩레이트 색: `abs > 0.05` → 주황 깜빡임 / `abs > 0.01` → 주황 / 기본 → 미표시

---

### LongPanel.jsx
> 롱 누적 에너지 + 체결 tape

| Prop | 타입 | 설명 |
|---|---|---|
| `energy` | number | 롱 누적 에너지 (USD) |
| `trades` | array | AggTrade 이벤트 배열 |

```
trades[n] = {
  marketType: 'FUTURES' | 'SPOT',
  price: string,
  quantity: string,
  tradedAt: number
}
```

> 가장 최신 항목 진입 시 `slideUpFromBottom` 애니메이션

---

### ShortPanel.jsx
> LongPanel과 동일 구조, 숏 방향

| Prop | 타입 | 설명 |
|---|---|---|
| `energy` | number | 숏 누적 에너지 (USD) |
| `trades` | array | AggTrade 이벤트 배열 |

---

### ShortLiqPanel.jsx
> 숏 포지션 청산 목록 + 누계 (좌하단)

| Prop | 타입 | 설명 |
|---|---|---|
| `total` | number | 숏 청산 누계 (히스토리 기준, USD) |
| `events` | array | 숏 청산 이벤트 목록 (newest first) |

```
events[n] = {
  side: 'BUY',          // 숏 청산 = BUY side
  price: string,
  quantity: string,
  tradeTime: string
}
```

> 레이아웃: 이벤트 목록(flex:1 상단) + 누계(하단 고정)

---

### LiquidationPanel.jsx
> 롱 포지션 청산 목록 + 누계 (우하단)

| Prop | 타입 | 설명 |
|---|---|---|
| `total` | number | 롱 청산 누계 (히스토리 기준, USD) |
| `events` | array | 롱 청산 이벤트 목록 (newest first) |

```
events[n] = {
  side: 'SELL',         // 롱 청산 = SELL side
  price: string,
  quantity: string,
  tradeTime: string
}
```

---

### MainCore.jsx
> 게이지 + 줄다리기 + 미니차트 컨테이너

| Prop | 타입 | 설명 |
|---|---|---|
| `longEnergy` | number | 롱 에너지 |
| `shortEnergy` | number | 숏 에너지 |
| `fundingRate` | number\|null | 펀딩레이트 (테두리 색 변화용) |
| `oiData` | array | OI 시계열 배열 |

> 내부 레이아웃: `flex-column` — 게이지(60%) / 미니차트(40%)

---

### EnergyGauge.jsx
> ECharts 반원 게이지 (롱/숏 비율 시각화)

| Prop | 타입 | 설명 |
|---|---|---|
| `longEnergy` | number | 롱 에너지 |
| `shortEnergy` | number | 숏 에너지 |

**게이지 색 구간**

| 구간 | 색 | 의미 |
|---|---|---|
| 0~20% | 초록(진) | 롱 강세 |
| 20~45% | 초록(연) | 롱 우세 |
| 45~55% | 흰색 | 중립 |
| 55~80% | 빨강(연) | 숏 우세 |
| 80~100% | 빨강(진) | 숏 강세 |

---

### TugOfWar.jsx
> 롱/숏 비율 줄다리기 바 (게이지 하단 고정)

| Prop | 타입 | 설명 |
|---|---|---|
| `longEnergy` | number | 롱 에너지 |
| `shortEnergy` | number | 숏 에너지 |

> 중앙 흰 점이 비율에 따라 좌우 이동 (`transition: 0.8s`)
> 위치: `position: absolute, bottom: 4px` (게이지 컨테이너 하단 고정)

---

### MiniChartPlaceholder.jsx
> 하단 미니차트 3분할 (SPOT / 오픈 포지션 볼륨 / SPREAD)

| Prop | 타입 | 설명 |
|---|---|---|
| `oiData` | array | OI 시계열 배열 |

> SPOT, SPREAD는 현재 TBD (미구현)
> 오픈 포지션 볼륨 칸에만 `OiLineChart` 렌더링

---

### OiLineChart.jsx
> Lightweight Charts v5 Area 차트 (OI 시계열)

| Prop | 타입 | 설명 |
|---|---|---|
| `oiData` | array | OI 시계열 배열 |

```
oiData[n] = {
  openInterest: string,
  collectedAt: string   // ISO datetime
}
```

**차트 옵션**

| 옵션 | 값 | 설명 |
|---|---|---|
| X축 레이블 | 숨김 | `timeScale: { visible: false }` |
| Y축 레이블 | 숨김 | `rightPriceScale: { visible: false }` |
| 현재가 라벨 | 우측 고정 오버레이 | `priceToCoordinate()` 기반 |
| 호버 툴팁 | 날짜 + OI값 | `subscribeCrosshairMove` |
| 색 | 증가→초록 / 감소→빨강 | 마지막 2개 비교 |

---

### PatternStrip.jsx
> 유사 패턴 가로 스크롤 (하단 440px)

| Prop | 타입 | 설명 |
|---|---|---|
| `patterns` | array | 유사 패턴 목록 |

```
patterns[n] = {
  candleTime: string,
  priceChange: number   // 소수 (0.05 = +5%)
}
```

> 현재 차트 TBD, priceChange 색: 양수→초록 / 음수→빨강

---

## 데이터 흐름

```
SSE (/api/signal/stream/sse)
  ├── aggtrade  → longEnergy / shortEnergy / longTrades / shortTrades
  ├── forceOrder → longLiqTotal / shortLiqTotal / longLiqEvents / shortLiqEvents
  └── oi        → oiDataHistory (append, slice -100)

REST API
  ├── /api/signal/init   → initData (largeTradeThreshold, latestFundingRate)
  └── /api/signal/history?symbol=&range=
        → longEnergy, shortEnergy
        → longLiqTotal, shortLiqTotal
        → longLiqEvents, shortLiqEvents
        → oiHistory
```
