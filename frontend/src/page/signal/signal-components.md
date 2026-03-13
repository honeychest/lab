# Signal Page — 컴포넌트 레퍼런스

> 각 컴포넌트의 **모든 조절 가능한 옵션**을 정리한 문서.
> 현재 사용 중인 값은 `← 현재` 로 표시.

---

## 목차

1. [EnergyGauge](#1-energygauge) — ECharts 반원 게이지
2. [TugOfWar](#2-tugofwar) — 줄다리기 애니메이션
3. [OiLineChart](#3-oilinechart) — Lightweight Charts 면적 차트
4. [LongPanel / ShortPanel](#4-longpanel--shortpanel) — 에너지 누적 패널
5. [LiquidationPanel / ShortLiqPanel](#5-liquidationpanel--shortliqpanel) — 청산 패널
6. [TopBar](#6-topbar) — 심볼 탭 + 시간 선택
7. [MainCore](#7-maincore) — 중앙 컨테이너
8. [MiniChartPlaceholder](#8-minichartplaceholder) — 미니차트 그리드
9. [PatternStrip](#9-patternstrip) — 유사 패턴 하단 스트립

---

## 1. EnergyGauge

**파일:** `frontend/src/page/signal/EnergyGauge.jsx`
**라이브러리:** ECharts (`import * as echarts from 'echarts'`)

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `longEnergy` | number | 롱 에너지 누계 (USD) |
| `shortEnergy` | number | 숏 에너지 누계 (USD) |

---

### ECharts gauge series — 전체 옵션 레퍼런스

#### 기본 형태 / 각도

```js
series: [{
    type: 'gauge',
    startAngle: 236,   // ← 현재 | 0~360, 12시=90, 반시계방향 증가
    endAngle:   -58,   // ← 현재 | 시작보다 작으면 반시계 방향으로 진행
    min: 0,            // ← 현재 | 게이지 최솟값
    max: 1000,         // ← 현재 | 게이지 최댓값
    splitNumber: 4,    // ← 현재 | 주요 눈금 분할 수
    radius: '90%',     // 게이지 반지름 (기본 '75%')
    center: ['50%', '50%'], // 중심점 위치
}]
```

> **각도 팁**
> - 일반 반원(위): `startAngle: 180, endAngle: 0`
> - 뒤집힌 반원(아래): `startAngle: 236, endAngle: -58` ← 현재
> - 풀 원: `startAngle: 225, endAngle: -45`

---

#### axisLine — 게이지 트랙(색 띠)

```js
axisLine: {
    show: true,         // 트랙 표시 여부
    roundCap: false,    // true = 양 끝을 둥글게
    lineStyle: {
        width: 16,      // ← 현재 | 트랙 두께 (px)
        // color: 구간별 색상 배열 [종료비율, 색]
        color: [
            [0.20, 'rgba(0,232,135,0.8)'],   // ← 현재
            [0.45, 'rgba(0,232,135,0.4)'],
            [0.55, 'rgba(255,255,255,0.7)'],
            [0.80, 'rgba(255,59,92,0.4)'],
            [1,    'rgba(255,59,92,0.8)'],
            // 구간 수 제한 없음, 합쳐서 1.0 이 되어야 함
        ],
        opacity: 1,       // 0~1
        shadowBlur: 0,    // 그림자 블러
        shadowColor: 'transparent',
    },
},
```

---

#### pointer — 바늘

```js
pointer: {
    show: true,          // ← 현재
    // icon 옵션: 'circle' | 'rect' | 'roundRect' | 'triangle' | 'diamond' | 'pin' | 'arrow' | 'none' | SVG path
    icon: 'triangle',    // ← 현재
    length: '40%',       // ← 현재 | 바늘 길이 (반지름 기준 %)
    width: 10,           // ← 현재 | 바늘 너비 (px)
    offsetCenter: ['0%', '-30%'], // ← 현재 | [x, y] 바늘 pivot 이동
    keepAspect: false,   // icon 비율 유지 여부
    itemStyle: {
        color: 'auto',   // ← 현재 | 'auto' = 현재 구간 색상 자동, 또는 고정색
        borderColor: 'auto',
        borderWidth: 0,
        opacity: 1,
        shadowBlur: 0,
        shadowColor: 'transparent',
    },
},
```

> `length: '60%'` 로 늘리거나, `icon: 'arrow'` 로 변경 가능.
> `offsetCenter: ['0%', '0%']` 으로 게이지 중심에 맞출 수 있음.

---

#### axisTick — 작은 눈금

```js
axisTick: {
    show: true,          // ← 현재
    splitNumber: 5,      // 주요 눈금 사이 작은 눈금 수
    distance: 18,        // ← 현재 | 트랙으로부터 거리 (음수=안쪽)
    length: 16,          // ← 현재 | 눈금 길이 (px)
    lineStyle: {
        color: 'rgba(255,255,255,0.25)', // ← 현재
        width: 1,        // ← 현재
        type: 'solid',   // 'solid' | 'dashed' | 'dotted'
        opacity: 1,
    },
},
```

---

#### splitLine — 큰 눈금(구분선)

```js
splitLine: {
    show: true,          // ← 현재
    distance: 18,        // ← 현재 | 트랙으로부터 거리
    length: 22,          // ← 현재 | 구분선 길이 (px)
    lineStyle: {
        color: 'auto',   // ← 현재 | 'auto' = 구간 색상 자동
        // color: 'rgba(255,255,255,0.2)', // 고정색 예시
        width: 2,        // ← 현재
        type: 'solid',
        opacity: 1,
        shadowBlur: 0,
    },
},
```

---

#### axisLabel — 게이지 숫자 라벨

```js
axisLabel: {
    show: false,         // ← 현재 (숨김)
    distance: 15,        // 트랙으로부터 거리
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: "'Pretendard', sans-serif",
    formatter: function(value) {
        return value + '%'; // 커스텀 포맷
    },
    rotate: 'tangential', // 'radial' | 'tangential' | 숫자(degree)
},
```

---

#### detail — 중앙 텍스트 (현재 값 표시)

```js
detail: {
    show: true,           // ← 현재
    offsetCenter: ['0%', '0%'], // ← 현재 | 중심 기준 이동 [x, y]
    formatter: function(val) {
        // ← 현재: 'Long' or 'Short' 텍스트
        const shortPercent = (val / 1000) * 100;
        const longPercent = 100 - shortPercent;
        return longPercent > 50 ? 'Long' : 'Short';

        // 다른 예시들:
        // return val.toFixed(1) + '%';    // 숫자 표시
        // return '{value|' + val + '}';   // rich text
    },
    textStyle: {
        fontSize: 16,         // ← 현재
        fontWeight: 'bold',   // ← 현재
        color: 'auto',        // ← 현재 | 'auto' = 구간 색상 자동
        fontFamily: "'Pretendard', sans-serif",
    },
    // rich text 예시
    rich: {
        value: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
        unit:  { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
    },
    width: 100,         // detail 영역 너비
    height: 40,         // detail 영역 높이
    borderRadius: 4,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    padding: 0,
},
```

---

#### data — 게이지 값

```js
data: [{
    value: 500,          // ← 현재: shortRatio (0~1000)
    name: '',            // 레이블 텍스트 (axisLabel 위에 표시)
    itemStyle: {
        color: undefined, // 바늘 개별 색상 override
    },
    detail: {
        // 개별 data 에서 detail override 가능
        formatter: '{value}%',
    },
    title: {
        offsetCenter: ['0%', '-20%'],
    },
}],
```

---

#### 애니메이션

```js
animation: true,              // ← 현재
animationDuration: 800,       // ← 현재 (ms)
animationEasing: 'cubicInOut', // ← 현재 (업데이트 시)

// easing 옵션:
// 'linear' | 'quadraticIn' | 'quadraticOut' | 'quadraticInOut'
// 'cubicIn' | 'cubicOut' | 'cubicInOut'  ← 현재
// 'quarticIn' | 'quarticInOut'
// 'quinticInOut' | 'sinusoidalInOut' | 'exponentialInOut'
// 'circularInOut' | 'elasticIn' | 'elasticOut' | 'bounceIn' | 'bounceOut'

animationDurationUpdate: 300, // 데이터 업데이트 시 별도 설정 가능
animationThreshold: 2000,     // 이 수 이상의 데이터 포인트 → 애니메이션 끔
```

---

#### progress — 값 위치까지 채우는 막대 (바늘 대신 또는 함께)

```js
progress: {
    show: false,    // 기본 꺼짐
    overlap: true,  // 여러 데이터일 때 겹치기
    width: 8,       // 두께 (px)
    clip: false,    // 트랙 밖으로 넘치면 자르기
    roundCap: false,
    itemStyle: {
        color: 'auto',
        borderColor: 'auto',
        borderWidth: 0,
    },
},
```

---

#### title — data[].name 위치 (게이지 라벨)

```js
title: {
    show: true,
    offsetCenter: ['0%', '-20%'],
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 'normal',
    fontFamily: "'Pretendard', sans-serif",
    backgroundColor: 'transparent',
    padding: 0,
},
```

---

### 자주 쓰는 조합 예시

```js
// 예시 A: 현재 숫자를 % 로 표시
detail: {
    show: true,
    formatter: (val) => `${((val / 1000) * 100).toFixed(1)}%`,
    textStyle: { fontSize: 20, fontWeight: 'bold', color: 'auto' },
    offsetCenter: ['0%', '10%'],
}

// 예시 B: 바늘 없이 progress 막대만 사용
pointer: { show: false },
progress: { show: true, width: 12 },

// 예시 C: 트랙 끝 둥글게 + 바늘 arrow
axisLine: { roundCap: true, lineStyle: { width: 20 } },
pointer: { icon: 'arrow', length: '50%', width: 8 },

// 예시 D: 풀 원 게이지
startAngle: 225,
endAngle: -45,
radius: '85%',
```

---

## 2. TugOfWar

**파일:** `frontend/src/page/signal/TugOfWar.jsx`

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `longEnergy` | number | 롱 에너지 |
| `shortEnergy` | number | 숏 에너지 |

### 조절 포인트

| 항목 | 위치 | 현재값 | 옵션 |
|---|---|---|---|
| 전체 컨테이너 너비 | style.width | `160px` | 숫자 자유 |
| 전체 컨테이너 높이 | style.height | `20px` | 숫자 자유 |
| 하단 고정 여백 | style.bottom | `4px` | 음수 가능 |
| 롱 노드 색 | backgroundColor | `#00e887` | HEX/RGB |
| 숏 노드 색 | backgroundColor | `#ff3b5c` | HEX/RGB |
| 노드 크기 | width/height | `10px` | 숫자 자유 |
| 중앙 마커 크기 | width/height | `5px` | 숫자 자유 |
| 중앙 이동 transition | transition | `0.8s ease-in-out` | CSS transition |
| 롱 노드 글로우 공식 | boxShadow | `8 + longGlow * 12` | 숫자 조정 |
| 숏 노드 글로우 공식 | boxShadow | `8 + shortGlow * 12` | 숫자 조정 |
| 눈금 위치 | [25, 40, 60, 75] | 4개 고정 | 배열 자유 |
| 노드 펄스 속도 | animation duration | `4s` | CSS duration |
| 중앙 진동 속도 | animation duration | `0.12s` | CSS duration |

---

## 3. OiLineChart

**파일:** `frontend/src/page/signal/OiLineChart.jsx`
**라이브러리:** Lightweight Charts v5 (`lightweight-charts`)

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `oiData` | `{openInterest, collectedAt}[]` | OI 히스토리 배열 |

---

### createChart 옵션

```js
createChart(container, {
    autoSize: true,           // ← 현재 | 컨테이너 크기 자동 추적

    layout: {
        background: {
            type: 'solid',    // 'solid' | 'gradient'
            color: '#0e0f18', // ← 현재
        },
        textColor: 'rgba(255,255,255,0.3)', // ← 현재
        fontSize: 12,
        fontFamily: 'Pretendard',
        attributionLogo: false, // ← 현재 | TradingView 로고 숨김
    },

    grid: {
        vertLines: {
            color: 'rgba(255,255,255,0.03)', // ← 현재
            style: 0,    // 0=solid 1=dotted 2=dashed 3=large dashed 4=sparse dotted
            visible: true,
        },
        horzLines: {
            color: 'rgba(255,255,255,0.03)', // ← 현재
            style: 0,
            visible: true,
        },
    },

    timeScale: {
        visible: false,       // ← 현재 (숨김)
        // 아래는 visible: true 일 때 옵션
        borderColor: 'rgba(255,255,255,0.1)',
        timeVisible: true,    // 시간 표시
        secondsVisible: false,
        rightOffset: 5,       // 오른쪽 여백 바
        barSpacing: 6,        // 봉 간격 (px)
        minBarSpacing: 0.5,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
        tickMarkFormatter: (time) => { /* 커스텀 포맷 */ },
    },

    rightPriceScale: {
        visible: false,       // ← 현재 (숨김)
        // 아래는 visible: true 일 때 옵션
        borderColor: 'rgba(255,255,255,0.1)',
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        mode: 0,   // 0=normal 1=logarithmic 2=percentage 3=indexed
        invertScale: false,
        alignLabels: true,
    },

    crosshair: {
        mode: 1,   // 0=normal 1=magnet ← 현재(기본) 2=hidden
        vertLine: {
            labelVisible: false, // ← 현재
            color: 'rgba(255,255,255,0.2)',
            width: 1,
            style: 0,   // solid/dotted/dashed
            visible: true,
        },
        horzLine: {
            labelVisible: false, // ← 현재
            color: 'rgba(255,255,255,0.2)',
            width: 1,
            style: 0,
            visible: true,
        },
    },
});
```

---

### AreaSeries 옵션

```js
chart.addSeries(AreaSeries, {
    lineColor: '#00e887',               // ← 현재 (증가 시)
    topColor: 'rgba(0,232,135,0.4)',    // ← 현재
    bottomColor: 'rgba(0,232,135,0.0)', // ← 현재
    lineWidth: 2,                       // ← 현재 | 1~4

    // 감소 시 → applyOptions 로 동적 변경
    // lineColor: '#ff3b5c'
    // topColor: 'rgba(255,59,92,0.4)'

    lineType: 0,     // 0=simple 1=withSteps 2=curved
    lineVisible: true,
    crosshairMarkerVisible: true,        // 호버 시 마커 점
    crosshairMarkerRadius: 4,
    crosshairMarkerBorderColor: '#fff',
    crosshairMarkerBackgroundColor: '#00e887',
    crosshairMarkerBorderWidth: 2,

    lastValueVisible: false,  // 우측 가격 라벨 (현재 커스텀 div로 대체)
    priceLineVisible: false,  // 현재가 점선
    priceLineWidth: 1,
    priceLineColor: '',        // 비어있으면 lineColor 사용
    priceLineStyle: 2,         // 0=solid 1=dotted 2=dashed 3=large dashed 4=sparse dotted

    baseValue: { type: 'price', price: 0 }, // 기준선 (BaseLine 타입 사용 시)

    priceScaleId: 'right',  // 'right' | 'left' | 커스텀 ID

    // 가격 포맷
    priceFormat: {
        type: 'price',       // 'price' | 'volume' | 'custom'
        precision: 2,
        minMove: 0.01,
        // type: 'custom' 일 때:
        // formatter: (price) => price.toLocaleString(),
    },
});
```

---

### 호버 툴팁 패턴 (현재 구조)

```js
chart.subscribeCrosshairMove((param) => {
    // param.time     — 현재 가리키는 시간 (unix seconds)
    // param.point    — { x, y } 마우스 위치 (px)
    // param.seriesData — Map<Series, {time, value}>

    const value = param.seriesData.get(series)?.value;
    // 커스텀 div 위치를 param.point 기준으로 조정
});
```

---

## 4. LongPanel / ShortPanel

**파일:**
- `frontend/src/page/signal/LongPanel.jsx`
- `frontend/src/page/signal/ShortPanel.jsx`

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `energy` | number | 누적 에너지 (USD) |
| `trades` | `TradeEntry[]` | 최근 체결 목록 (SSE 수신) |
| `side` | `'LONG' \| 'SHORT'` | 패널 종류 (현재 내부에서 미사용, 색으로 구분) |

> `side` prop은 현재 코드에서 받지만 내부에서 사용하지 않음.
> LongPanel은 초록(`#00e887`), ShortPanel은 빨강(`#ff3b5c`) 고정.

### 조절 포인트

| 항목 | 현재값 | 변경 가능 범위 |
|---|---|---|
| 에너지 글자 크기 | `36px` | 자유 |
| 틱 목록 최대 표시 수 | `trades.slice(-20)` | `-N` 변경 (SignalPage 버퍼도 동일하게) |
| 틱 투명도 공식 | `1 - idx * 0.05` | 계수 조정 (idx=0 최상단 최밝음, 아래로 갈수록 어두워짐) |
| 신규 틱 애니메이션 시간 | `0.3s` | CSS duration |
| 신규 틱 이동 거리 | `translateY(20px)` | px 값 |
| 왼쪽 보더 두께 (Long) | `3px solid #00e887` | 자유 |
| 오른쪽 보더 두께 (Short) | `3px solid #ff3b5c` | 자유 |
| 가격 소수점 | `.toFixed(2)` | 자유 |
| 수량 소수점 | `.toFixed(3)` | 자유 |

---

## 5. LiquidationPanel / ShortLiqPanel

**파일:**
- `frontend/src/page/signal/LiquidationPanel.jsx` — 롱 청산 (빨강)
- `frontend/src/page/signal/ShortLiqPanel.jsx` — 숏 청산 (초록)

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `total` | number | 누계 합계 (USD) |
| `events` | `ForceOrderEntry[]` | 청산 이벤트 목록 |

### ForceOrderEntry 구조

```ts
{
    tradeTime: number   // timestamp (key 용)
    price: string
    quantity: string
    side: 'SELL' | 'BUY'
    symbol: string
}
```

### 조절 포인트

| 항목 | 현재값 | 변경 가능 |
|---|---|---|
| 이벤트 표시 최대 수 | `events.slice(0, 12)` | 숫자 변경 |
| 이벤트 투명도 감쇠 | `1 - idx * 0.06` | 계수 조정 |
| 누계 글자 크기 | `22px` | 자유 |
| 신규 이벤트 애니메이션 | `slideDown 0.2s ease-out` | CSS |
| 이동 거리 | `translateY(-8px)` | px 조정 |
| 롱 청산 색 | `#ff3b5c` | HEX |
| 숏 청산 색 | `#00e887` | HEX |
| 금액 포맷 | `Math.floor(val).toLocaleString()` | 소수점, M/K 등 |

---

## 6. TopBar

**파일:** `frontend/src/page/signal/TopBar.jsx`

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `symbol` | string | 현재 선택된 심볼 |
| `onSymbolChange` | fn | 심볼 변경 콜백 |
| `timeRange` | string | 현재 시간 범위 |
| `onTimeRangeChange` | fn | 시간 범위 변경 콜백 (localStorage 저장 포함) |
| `fundingRate` | number\|null | 펀딩비 (소수, 예: 0.0003) |
| `timeRanges` | `{value,label,apiRange}[]` | SignalPage.jsx의 TIME_RANGES 배열 |

### 조절 포인트

| 항목 | 현재값 | 변경 방법 |
|---|---|---|
| 심볼 목록 | `['BTCUSDT', 'ENAUSDT']` | 배열에 추가 |
| 시간 범위 목록 | `TIME_RANGES` (SignalPage.jsx) | **TIME_RANGES 배열만 수정** |
| 펀딩비 깜빡임 임계 | `abs > 0.05` | 숫자 조정 |
| 펀딩비 강조 임계 | `abs > 0.01` | 숫자 조정 |
| 깜빡임 속도 | `4s ease-in-out` | CSS duration |
| 높이 | `44px` | px 조정 |
| 펀딩비 null 처리 | `visibility: hidden` | 레이아웃 공간 유지, 값 없을 때 숨김 |

### SignalPage의 timeRange → API range 매핑

```js
// SignalPage.jsx 상단 — 여기만 수정하면 TopBar 라벨/버튼/API 범위 모두 반영
const TIME_RANGES = [
    { value: '1m',  label: '1m',   apiRange: '10m' },
    { value: '5m',  label: '5m',   apiRange: '50m' },
    { value: '30m', label: '30m',  apiRange: '5h'  },
    { value: '1h',  label: '1h',   apiRange: '10h' },
    { value: '4h',  label: '~40h', apiRange: '40h' },
];
const getDataRange = (range) => TIME_RANGES.find((r) => r.value === range)?.apiRange ?? range;
// API 호출: /api/signal/history?symbol=BTCUSDT&range=10m
```

---

## 7. MainCore

**파일:** `frontend/src/page/signal/MainCore.jsx`

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `longEnergy` | number | EnergyGauge + TugOfWar에 전달 |
| `shortEnergy` | number | EnergyGauge + TugOfWar에 전달 |
| `fundingRate` | number\|null | 보더 색/애니메이션 제어 |
| `oiData` | `OiEntry[]` | MiniChartPlaceholder에 전달 |

### 펀딩비 보더 임계값

```js
abs > 0.05 → border gold 0.5, 깜빡임 ON
abs > 0.01 → border gold 0.3
그 외       → border gold 0.15
```

### 레이아웃 비율

```js
// EnergyGauge + TugOfWar
<div style={{ flex: '60%' }}>

// MiniChartPlaceholder
<div style={{ flex: '40%' }}>
```

> 비율 변경: `flex: '60%'` → `flex: '70%'` 등으로 조정

---

## 8. MiniChartPlaceholder

**파일:** `frontend/src/page/signal/MiniChartPlaceholder.jsx`

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `oiData` | `OiEntry[]` | OiLineChart에 전달 |

### 패널 목록

```js
['SPOT', '오픈 포지션 볼륨', 'SPREAD']
// 'SPOT', 'SPREAD' → TBD placeholder
// '오픈 포지션 볼륨' → OiLineChart 렌더
```

> 새 패널 추가: 배열에 레이블 추가 + `label === '새 이름'` 분기 추가

### OI 값 포맷 (getLastOiValue)

```js
val >= 1_000_000 → 'X.XXM'
val >= 1_000     → 'X.XK'
그 외             → 정수
```

---

## 9. PatternStrip

**파일:** `frontend/src/page/signal/PatternStrip.jsx`

### Props

| Prop | 타입 | 설명 |
|---|---|---|
| `patterns` | `PatternEntry[]` | 유사 패턴 목록 (현재 항상 빈 배열) |

### PatternEntry 구조

```ts
{
    priceChange: number   // % 등락 (양수=상승, 음수=하락)
    candleTime: string    // ISO 날짜 문자열
    // 추후 차트 데이터 필드 추가 예정
}
```

### 조절 포인트

| 항목 | 현재값 | 변경 방법 |
|---|---|---|
| 최대 패턴 표시 수 | `patterns.slice(0, 5)` | 숫자 변경 |
| 마지막 패턴 투명도 | `idx === 4 ? 0.45 : 1` | 조건/값 변경 |
| 패턴 카드 너비 | `minWidth: 180px` | px 조정 |
| 미니차트 높이 | `height: 42px` | px 조정 |
| 사이드 라벨 방향 | `writingMode: 'vertical-rl'` | CSS 변경 |

---

## 데이터 흐름 요약

```
useSignalSse({ symbol })
  ├── aggTrades[]   → SignalPage → longEnergy/shortEnergy, longTrades/shortTrades
  ├── forceOrders[] → SignalPage → longLiqTotal/shortLiqTotal, longLiqEvents/shortLiqEvents
  └── latestOi      → SignalPage → oiDataHistory[]

axios GET /api/signal/init?symbol=
  └── initData → fundingRate → TopBar, MainCore

axios GET /api/signal/history?symbol=&range=
  └── historyData → longEnergy, shortEnergy, longLiqTotal, shortLiqTotal
                    longLiqEvents, shortLiqEvents, oiHistory
```

---

## 컴포넌트 → 파일 매핑 (한눈에)

| 컴포넌트 | 파일 |
|---|---|
| `SignalPage` | `frontend/src/page/signal/SignalPage.jsx` |
| `TopBar` | `frontend/src/page/signal/TopBar.jsx` |
| `MainCore` | `frontend/src/page/signal/MainCore.jsx` |
| `EnergyGauge` | `frontend/src/page/signal/EnergyGauge.jsx` |
| `TugOfWar` | `frontend/src/page/signal/TugOfWar.jsx` |
| `MiniChartPlaceholder` | `frontend/src/page/signal/MiniChartPlaceholder.jsx` |
| `OiLineChart` | `frontend/src/page/signal/OiLineChart.jsx` |
| `LongPanel` | `frontend/src/page/signal/LongPanel.jsx` |
| `ShortPanel` | `frontend/src/page/signal/ShortPanel.jsx` |
| `LiquidationPanel` | `frontend/src/page/signal/LiquidationPanel.jsx` |
| `ShortLiqPanel` | `frontend/src/page/signal/ShortLiqPanel.jsx` |
| `PatternStrip` | `frontend/src/page/signal/PatternStrip.jsx` |
| `useSignalSse` | `frontend/src/domain/binance/model/hook/useSignalSse.ts` |
