# 2026-05-04 FUTURES OHLC 이상 데이터 재발 방지 작업 인수인계

## 적용 규칙
- `chs/chs-rules.md`, `chs/harness/persona/AI-db.md` 기준으로 진행.
- 소스 수정은 계획 보고 -> 승인 -> DRAFT -> 구현 승인 -> 실제 구현 순서.
- lint/build 등 터미널 명령은 사용자 승인 없이 자동 실행 금지.

## 발생 증상
- signal 페이지 FUTURES 차트에 비정상 OHLC 데이터가 표시됨.
- 문제 구간: `2026-05-02 17:00 ~ 2026-05-03 02:30 KST`
  - UTC ms: `1777708800000 ~ 1777743000000`
- 화면상 특정 가격 `78148.20000000`이 여러 1분봉의 `low_price`, `close_price`, 일부 `open_price`에 반복 주입됨.
- 차트에서는 해당 구간에 아래꼬리/수직선이 과도하게 생기고 캔들 흐름이 깨짐.

## 확인된 데이터 상태
- 대상: `BTCUSDT`, `FUTURES`
- 구간 데이터 개수:
  - `agg_trade_1m`: 570 rows
  - `agg_trade_5m`: 114 rows
  - `raw_agg_trade`: 156,642 rows
- `raw_agg_trade`는 해당 구간에 충분히 존재했음.
- raw 기준 OHLC는 정상 범위였고, `agg_trade_1m`만 raw와 불일치.
- 대표 현상:
  - `agg_trade_1m.low_price = 78148.20000000` 반복
  - `agg_trade_1m.close_price = 78148.20000000` 반복
  - raw low/close는 실제로는 대략 `78300~78500`대였음
  - `min_agg_trade_id = 0` 또는 `min_first_trade_id = 0` row가 다수
  - `buy_trade_count = 0`, `sell_trade_count = 0`, `trade_count > 0`인 kline-like row도 존재

## Outlier 진단 결과
- Admin outlier 진단에서 다음 결과 확인:
  - raw 불일치 1m: 740건
  - 영향 5m: 185건
  - `OPEN_CLOSE_MISMATCH`: 401
  - `ID_ZERO`: 740
  - `PRICE_OUT_OF_RAW_RANGE`: 335
  - `KLINE_LIKE_ROW`: 338
- 보정 실행 후 signal FUTURES 차트는 정상화됨.

## 오늘 적용한 보강
- 파일:
  - `frontend/src/page/admin/AdminPage.jsx`
  - `springboot/src/main/java/com/chs/springboot/domain/binance/service/ManualBackfillService.java`
- Admin Outlier 범위에 `직접 지정` 추가.
- 직접 From/To datetime-local 입력 후 outlier 진단/보정 가능.
- outlier 진단 결과에 `reason`, `max_price_diff`, reason별 summary 추가.
- 보정 결과에 대상 1m/5m count summary 추가.
- 백엔드 재기동 필요.

## 현재 원인 추정
- 확정: raw는 정상, `agg_trade_1m` 집계/보정/수집 결과가 오염됨.
- 유력한 오염 형태:
  1. kline 기반 row와 raw 기반 row가 섞임
  2. `min_agg_trade_id`, `min_first_trade_id`가 0인 row가 정상 raw row처럼 남음
  3. 특정 가격 `78148.2`가 다수 row의 low/close/open에 반복 주입됨
  4. 이후 `agg_trade_5m`는 오염된 1m을 rollup하면서 같이 오염됨
- 아직 미확인:
  - 어떤 수집/롤업 경로가 `78148.2`를 주입했는지
  - live stream, manual backfill, flat correction, kline fallback 중 어느 경로인지
  - `ON DUPLICATE KEY UPDATE` 조건이 기존 오염 row를 유지하거나 부분 갱신했는지

## 내일 작업 목표
사후 outlier 보정이 아니라 사전 방지/자동 차단을 추가한다.

## 내일 우선 확인할 후보
1. `ManualBackfillService.fillMissing1mWithKlines()`
   - `ON DUPLICATE KEY UPDATE`가 `trade_count = 0`일 때만 갱신함.
   - 이번 row는 `trade_count > 0`인데 id가 0인 row가 많았으므로, 오염 row가 덮어써지지 않고 남았을 가능성 확인.
2. `collectRollup1m()`
   - `agg_trade_1s` -> `agg_trade_1m` rollup 시 open/high/low/close 산출 경로 확인.
3. live 저장 경로
   - `AggTradeStorageService`, `AggTradeRollupService`, `AggTrade1sRollupService` 쪽에서 id 0 row 또는 고정 low가 생성될 수 있는지 확인.
4. 보정/수집 실행 순서
   - raw backfill, 1m rollup, kline fallback, 5m rollup이 같은 시간대에 중복 실행되며 오염 row를 만든 가능성 확인.

## 재발 방지 아이디어
- 1m insert/update 전 guard:
  - raw가 존재하는 분이면 `agg_trade_1m` OHLC가 raw high/low 범위를 벗어나는 row는 insert/update 차단 또는 raw 기준 재생성.
  - `min_agg_trade_id = 0 OR min_first_trade_id = 0`이면서 raw가 존재하면 kline fallback row로 확정하지 않기.
  - `buy_trade_count = 0 AND sell_trade_count = 0 AND trade_count > 0` row는 raw 존재 구간에서는 kline-like로 표시/차단.
- 5m rollup 전 guard:
  - 포함된 1m에 outlier reason이 있으면 5m rollup 중단 또는 먼저 1m 재생성.
- admin health에 사전 탐지:
  - 최근 N시간 outlier count를 주기적으로 보여주거나 알림.
- 자동 복구:
  - raw가 있는 최근 구간은 outlier 발견 시 raw 기준 1m 재생성 + 영향 5m 재롤업.
  - raw가 없는 오래된 구간은 kline 기반 보정으로 분리.

## 바로 쓸 수 있는 재현/검증 기준
- 문제 구간:
  - symbol: `BTCUSDT`
  - market_type: `FUTURES`
  - fromMs: `1777708800000`
  - toMs: `1777743000000`
- 이상 조건:
  - `agg_trade_1m` OHLC 중 하나가 raw high/low 범위 밖
  - `agg_trade_1m.open_price <> raw_open`
  - `agg_trade_1m.close_price <> raw_close`
  - `min_agg_trade_id = 0 OR min_first_trade_id = 0`
  - `buy_trade_count = 0 AND sell_trade_count = 0 AND trade_count > 0`

## 다음 대화 시작 시 권장 첫 단계
1. `ManualBackfillService`, rollup/storage service의 1m 생성 경로를 최소 범위로 읽는다.
2. 이번 현상(`78148.2` 반복, id zero, kline-like)을 만들 수 있는 코드 경로를 특정한다.
3. 수정 계획 보고 후 승인받고 DRAFT로 guard 설계를 넣는다.
