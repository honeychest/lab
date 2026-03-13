# Cesium Page — 구조 문서

## 파일 위치

```
frontend/src/page/weather/
├── CesiumPage.jsx               ← 메인 페이지 (상태 관리, 컴포넌트 조합)
└── CesiumPage.module.css        ← CSS 모듈 (root, loadingOverlay, spinner)

frontend/src/domain/weather/ui/
├── map/
│   └── CesiumMap.jsx            ← Cesium 3D 지구본 지도
├── panel/
│   └── WeatherPanel.jsx         ← 드래그 가능한 기온 오버레이 패널
└── detail/
    └── WeatherDetail.tsx        ← 지역 클릭 시 날씨 상세 팝업
```

---

## 전체 레이아웃 (ASCII Wireframe)

### 데스크탑

```
┌────────────────────────────────────────────────────────────────┐
│  Header (공통 레이아웃)                                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                                              ┌──────────┐│ │
│  │                                              │ 전국 기온││ │ ← WeatherPanel
│  │                                              │ [00시 ▼] ││ │   (드래그 가능)
│  │                                              │ 서울  7° ││ │
│  │       CesiumMap (3D 지구본)                  │ 경기  6° ││ │
│  │       - 시도별 polygon 색상 (기온 히트맵)     │ 강원  3° ││ │
│  │       - 클릭 → handleRegionClick             │ 충북  8° ││ │
│  │       - 초기 로딩 중: 스피너 오버레이          │ ...      ││ │
│  │                         ┌────────────────┐  └──────────┘│ │
│  │                         │  강원특별자치도 │              │ │ ← WeatherDetail
│  │                         │  3°C    ☁      │              │ │   (클릭 좌표 기준)
│  │                         │  강수 20%  습도 75%           │ │
│  │                         │  풍속 3.2m/s               X │ │
│  │                         │  강수량 0mm   예보: 06시      │ │
│  │                         └────────────────┘              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Footer (Cesium / Cesium, TypeScript — 팝업 오픈 시)           │
└────────────────────────────────────────────────────────────────┘
```

### 모바일

```
┌────────────────────────────────────┐
│  Header                            │
├────────────────────────────────────┤
│                                    │
│   CesiumMap (3D 지구본)             │
│   - 시도별 polygon 색상             │
│   - 터치 클릭 → 팝업                │
│                        ┌─────────┐ │
│                        │전국 기온│ │  ← WeatherPanel
│                        │[시간 ▼]│ │    (드래그 가능, 폭 좁음)
│                        │서울  7°│ │
│                        │경기  6°│ │
│                        └─────────┘ │
│                                    │
├────────────────────────────────────┤
│  ▲ 강원특별자치도              ✕   │
│  3°C  ☁  20%  75%  3.2m/s         │  ← WeatherDetail
│  (Bottom Sheet, 하단에서 위로 슬라이드)│
└────────────────────────────────────┘
```

### 초기 로딩 오버레이

```
┌──────────────────────────────────┐
│                                  │
│                                  │
│           ⟳  (스피너)            │
│       날씨 데이터 로딩 중...       │
│                                  │
│                                  │
└──────────────────────────────────┘
```

---

## 컴포넌트별 Props & 동작

---

### CesiumPage.jsx
> 컴포넌트 조합 + 상태 관리. 수정할 게 없으면 건드리지 않는다.

| 상태 | 타입 | 설명 |
|---|---|---|
| `selectedHourRef` | ref | 현재 선택 시간 (stale closure 방지용 ref) |
| `isMobile` | boolean | 화면 너비 768px 미만 여부 |
| `selectedWeather` | object\|null | 팝업 표시 날씨 데이터 (null=팝업 닫힘) |
| `popupPos` | `{x, y}` | PC 팝업 화면 좌표 (3D→2D 변환값) |

**useWeatherData 훅 반환값**

| 값 | 타입 | 설명 |
|---|---|---|
| `weatherList` | array | 전국 10개 시도 날씨 데이터 (GEO_ORDER 순) |
| `availableHours` | number[] | DB에 저장된 시간대 목록 (예: `[0, 3, 6, 12]`) |
| `selectedHour` | number\|null | 현재 선택된 시간대 |
| `setSelectedHour` | fn | 시간대 변경 함수 |
| `isInitialLoading` | boolean | 첫 데이터 로딩 중 여부 |
| `minT` / `maxT` | number | 전국 최저/최고 기온 (Cesium 색상 범위 계산용) |
| `errorCode` | string\|null | API 에러 코드 |
| `retry` | fn | 에러 시 재시도 함수 |

---

### CesiumMap.jsx
> Cesium 3D 지구본 — 시도별 polygon 렌더링 + 클릭 이벤트

| Prop | 타입 | 설명 |
|---|---|---|
| `weatherList` | array | 시도별 날씨 데이터 (기온 색상 계산용) |
| `minT` | number | 전국 최저 기온 |
| `maxT` | number | 전국 최고 기온 |
| `onRegionClick` | fn | 지역 클릭 콜백 |

**onRegionClick 페이로드**

```
null → 빈 공간 클릭 (팝업 닫기)

{
  fullName: string,        // GeoJSON 원본 지역명 (예: "강원특별자치도")
  mappingName: string,     // 매핑된 이름 (예: "강원도")
  screenPosition: {x, y}  // 클릭 지점 2D 화면 좌표
}
```

> 기온 색상: `minT~maxT` 범위를 파란색(저온) → 빨간색(고온)으로 매핑
> 클릭 감지: Cesium의 `ScreenSpaceEventHandler`로 polygon 피킹

---

### WeatherPanel.jsx
> 드래그 가능한 기온 오버레이 패널 (react-draggable)

| Prop | 타입 | 설명 |
|---|---|---|
| `weatherList` | array | 시도별 날씨 데이터 |
| `availableHours` | number[] | 선택 가능한 시간대 목록 |
| `selectedHour` | number\|null | 현재 선택 시간 |
| `setSelectedHour` | fn | 시간 변경 콜백 |
| `isMobile` | boolean | 모바일 여부 (패널 폭 조정) |
| `minT` | number | 최저 기온 (기온 색상 계산) |
| `maxT` | number | 최고 기온 (기온 색상 계산) |

```
weatherList[n] = {
  name: string,       // 시도명 (예: "서울")
  temp: string,       // 기온 (예: "7")
  sky: string,        // 하늘 상태 코드
  time: string,       // 예보 시각 (예: "0600")
  pop: string,        // 강수확률 (%)
  hum: string,        // 습도 (%)
  wind: string,       // 풍속 (m/s)
  rain: string        // 강수량 (mm)
}
```

> 기온 색상: `getRelativeColor(temp, minT, maxT)` — 전국 최저/최고 대비 상대적 위치
> 접기/펼치기: 패널 헤더 클릭으로 토글

---

### WeatherDetail.tsx
> 지역 클릭 팝업 — PC: 클릭 좌표 기준 고정 / 모바일: bottom sheet

| Prop | 타입 | 설명 |
|---|---|---|
| `weather` | WeatherData | 표시할 날씨 데이터 |
| `isMobile` | boolean | 모바일 여부 (위치 결정) |
| `popupPos` | `{x, y}` | PC 팝업 좌표 |
| `onClose` | fn | 닫기 콜백 |

**WeatherData 구조**

```
{
  city: string,          // 지역 전체명 (예: "강원특별자치도")
  name: string,          // 매핑명 (예: "강원도")
  temp: string,          // 기온 (°C)
  sky: string,           // 하늘 상태 코드
  displayTime: string,   // 예보 시각 표시 (예: "06시")
  pop: string,           // 강수확률 (%)
  hum: string,           // 습도 (%)
  wind: string,          // 풍속 (m/s)
  rain: string           // 강수량 (mm)
}
```

**표시 항목**

| 항목 | PC | 모바일 |
|---|---|---|
| 기온(°C) | ✓ | ✓ |
| 하늘 상태 아이콘 | ✓ | ✓ |
| 강수확률 | ✓ | ✓ |
| 습도 | ✓ | ✓ |
| 풍속 | ✓ | ✓ |
| 강수량 | ✓ | - |
| 예보 시각 | ✓ | - |

> PC: 클릭 좌표 기준 우측 130px 오프셋, `position: fixed`
> 모바일: 화면 하단 고정 bottom sheet, `Draggable` 래퍼 적용

---

## 데이터 흐름

```
REST API
  └── useWeatherData() 내부
        GET /api/weather?hour={selectedHour}
          → weatherList (시도별 기온/하늘/강수 등)
          → availableHours (DB 저장 시간대 목록)
          → minT, maxT (전국 최저/최고 기온)

지역 클릭 흐름:
  CesiumMap (ScreenSpaceEventHandler)
    → onRegionClick(payload)
    → CesiumPage.handleRegionClick
    → weatherList에서 지역 매핑
    → setSelectedWeather({ ...found, city, displayTime, pop, hum })
    → WeatherDetail 팝업 렌더링
```

---

## stale closure 해결 방식

`CesiumMap`에 등록된 `onRegionClick` 콜백이 처음 등록 시점의 `selectedHour`를 캡처해 이후 시간 변경을 반영 못하는 문제:

```
[문제] useState → 콜백 클로저에 옛날 값 캡처됨
[해결] useRef → ref.current는 항상 최신값 참조

selectedHourRef.current = selectedHour (useEffect로 동기화)
콜백 내부에서 selectedHourRef.current 읽기 → 항상 최신 시간
```

---

## 에러 처리

- API 에러: `errorCode` 세팅 → `<ErrorPage code={errorCode} onRetry={retry} />` 오버레이 렌더
- 빈 공간 클릭: `onRegionClick(null)` → `setSelectedWeather(null)` (팝업 닫기)
- 지역명 매핑 실패: `setSelectedWeather(null)` (팝업 미표시)
