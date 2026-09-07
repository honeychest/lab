# HANDOFF — 일회성 작업 인수인계 (완료되면 이 파일을 비운다)

> 용도: 상설 현황판(progress.html)이 없는 일회성 작업의 세션 간 인계.
> 새 세션(Claude·Codex 무관)은 이 파일이 비어 있지 않으면 먼저 읽고 이어서 작업한다.
> **끝난 항목은 남기지 않고 지운다** (경위는 git 이력에 있다).

## 바이낸스 마틴게일 분할주문 크롬 확장 (2026-09-07 신설, 미커밋)

`extension/` 폴더 신설. 지정가 기준으로 **가격은 등비**, **금액은 마틴게일(등비)** 로 나눠
지정가 주문을 한 번에 걸어 두는 크롬 확장(MV3). 바이낸스 기본 scale order 는 금액을 균등
또는 직선 증감으로만 나눠서 이 배분이 안 되는 것이 만든 이유다. 상세는 `extension/README.md`.

**서버(`springboot/`)를 한 줄도 안 건드린다.** 서버 autotrade 에 LIMIT 주문 타입을 추가하는
안도 검토했으나, 그 폴더를 Codex 세션이 작업 중이라 충돌을 피해 독립 확장으로 갔다.
Jenkinsfile 의 변경 감지가 `springboot/`·`frontend/`·`nexus/` 세 접두사만 보므로
`extension/` 은 배포 파이프라인에 안 걸린다(확인함).

### 확정된 설계 (사용자와 합의, 뒤집으려면 재협의)
- 크롬 확장 MV3, 스토어 미등록 언팩드 로컬 설치, **외부 라이브러리 0개**.
- 바이낸스 REST 직접 호출. 화면 자동조작(DOM 클릭)과 세션 쿠키 방식은 기각
  (전자는 중간에 조용히 어긋나고 예행연습 불가, 후자는 로그인 세션이 API 키보다 권한이 큼).
- **본계정** API 키. 권한은 Reading + Futures 만, 출금·이체·현물·옵션 전부 끔.
  서브계정은 바이낸스 화면 전환이 안 돼 "보는 계좌와 주문 나가는 계좌가 다른" 상태가 되어 기각.
- 키는 `chrome.storage.local`. **처음엔 `session` 이었는데 확장을 새로고침할 때마다 지워져
  못 쓴다는 것이 실사용에서 드러나 바꿨다**(2026-09-07). 위험은 키 권한 축소와 IP
  화이트리스트로 닫는다.
- 포지션 모드는 **양방향(Hedge)** 기준. `positionSide` 를 LONG/SHORT 로 명시한다.
- 제외 회차가 생겨도 **건너뛰고 진행**(전체 거부 아님). 전송 실패는 확정 거부와 접수 불명을
  나눠 거부는 계속, 불명은 즉시 중단.
- 배율은 0.1 단위 스테퍼 1.0~3.0, 기본 2.0. 텍스트 입력 없음.

### 계산의 핵심 (되돌리면 안 되는 것)
- **부동소수를 쓰지 않는다.** `Math.floor(a / step)` 은 경계에서 한 단위 틀리고
  (`0.1*3 === 0.30000000000000004`) 그 수량은 LOT_SIZE 로 거부된다. 양자화는 전부 BigInt.
- **목표 금액과 실제 금액을 분리해 표시한다.** 수량을 주문단위로 내리면 실제 금액은 목표보다
  작고, 최소수량·최소명목에 걸리는 앞 회차는 아예 안 나간다. 배율이 클수록 앞 회차가 작아져
  이런 제외가 생기는 것이 정상이다.
- **PERCENT_PRICE 는 방향마다 한쪽만 막는다.** 매수는 위쪽만(`price <= mark * multiplierUp`),
  매도는 아래쪽만. 양쪽을 다 검사하면 분할 매수가 통째로 막힌다 —
  실제로 그 버그를 냈다가 화면에서 발견해 고쳤다(2026-09-07, `test/filters.test.mjs` 가 고정).

### Codex xhigh 검수 반영 (2026-09-07)
계획 단계에서 24건 지적, 21건 수용. 제가 놓쳤던 것 셋:
포지션 모드를 조회 안 해 `positionSide` 를 못 보냄 / digest 로는 중복 주문을 못 막음(응답
유실 시 접수 여부 불명) / service worker 가 30초 유휴에 종료돼 전역 실행 상태가 사라짐.
셋 다 반영됨(`positionSide/dual` 조회, `clientOrderId` 조회 후 재개, 회차 상태를 매 전송
전후로 `storage.session` 기록).

### 확인된 것
- 코어 단위테스트 31건 통과(`cd extension && npm test`). 계산·양자화·필터만 검증한다.
- 사용자가 브라우저에서 **실제 주문 전송까지 확인**(2026-09-07).
- 패널 UX 수정 3회: 접힌 상태 드래그 이동+위치 기억 / 오더북 클릭으로 기준가 채우기 /
  입력 중 포커스 유지(영역별 렌더로 분리, 전체 재렌더가 원인이었음).
- commit-check 로 **중복 주문 경로를 커밋 전에 잡았다** — `PLACE` 를 받을 때마다 회차 상태를
  새로 만들어서, 전송이 중단된 뒤 실행 버튼을 다시 누르면 접수된 회차가 `PENDING` 으로
  되돌아가 재전송됐다. `createState` -> `ensureState`(기존 상태 재사용)로 바꾸고, 접수 불명이
  남아 있으면 전송 자체를 막고 조회 경로만 열어 뒀다. `test/execution.test.mjs` 가 고정한다.

### 다음 세션 할 일
1. 키를 `local` 로 바꾼 뒤 **재확인이 안 끝났다.** 확장 새로고침 → 옵션에서 키 재입력 →
   키 없을 때 빨간 띠가 뜨는지 → 주문이 나가는지 순서로 확인해야 한다.
   (이전 키는 `session` 에 있었으므로 이미 사라졌다.)
2. **증거금 검사 미구현** — 총액이 가용 잔고를 넘는지 확인하지 않는다. 넘으면 바이낸스가
   회차별로 거부할 뿐이다. 넣을지는 사용자 결정 대기 중.
3. **push 는 안 했다.** 에이전트는 커밋까지만 하므로 사용자가 직접 push 한다.
   `extension/` 은 Jenkins 변경 감지(`springboot/`·`frontend/`·`nexus/` 세 접두사)에 안 걸려
   push 해도 배포·컨테이너 재기동이 일어나지 않는다(Jenkinsfile 166줄 전체 확인).
   같은 작업트리에 Codex 세션의 `springboot/.../autotrade/`·`frontend/src/page/autotrade/`
   변경이 남아 있다 — 그건 이 커밋에 안 들어갔다.

**죽음조건: 위 1~3 이 끝나고 커밋되면 이 절을 통째로 지운다.**

## binance 자동매매 — LLM 시장 분석 다음 작업 (2026-09-04 이어서)
배경·설계는 `docs/binance/CONTEXT.md` 단일 원본. 멀티 타임프레임
(1m/5m/15m/4h/1d) 라이브 버퍼 + 로컬 LLM(Mac-mini-LLM) 분석/질의응답 기능을 구현·수정
완료(`5d42b75`·`bebfdf0`·`e2e5543`·`8a32195`). 자동 5분 스케줄은 폐지하고 관리자가
"분석 요청" 버튼을 눌러야만 LLM을 호출하도록 전환됨(리소스 낭비 우려로 사용자 요청).

### 완료 — 분석 요청을 docker 인스턴스와 무관하게 (2026-09-04)
리더가 아닌 인스턴스(docker1/docker2)로 분석 요청이 가면 무조건 실패하던 문제(리더가 중간에
바뀌면 갑자기 안 되는 것도 같은 원인) 해결. 비리더가 Redis `server:leader` 값을 읽어 실제
리더로 1회 내부 전달하는 방식(`LeaderElectionService.getCurrentLeaderName()` + 신규
`BinanceAnalysisLeaderForwarder`)으로 구현·커밋(`e935d3d`)·푸시·배포 완료. 코덱스 검수(방향
논의 + 계획 xhigh 검수)로 인증 방식 오류(Authorization 아닌 Cookie)·ask 바디 재읽기 불가·
전달 실패 시 로컬 폴백의 LLM 중복호출 위험을 구현 전에 잡음. 배포 후 브라우저로 직접
확인 — 두 인스턴스 정상 기동, 기존 리더 경로(DOCKER1) 분석 요청 정상 동작(14.2초). 단,
비리더→리더 전달 경로 자체는 nginx `SRV_ID` 쿠키가 HttpOnly라 브라우저로는 재현 못 했고
단위테스트 10케이스(MockRestServiceServer)로만 검증됨 — 다음에 리더가 자연 전환될 때
실제 전달 경로를 한 번 더 확인하면 좋다.

### 완료 — 오늘 세션 운영 확인과 일봉 인터벌 추가 (2026-09-04)
- `/api/analysis/search` 실제 POST와 분석 화면을 운영에서 확인했다. ENAUSDT 15m·5m·1m과
  BTCUSDT 1m 요청이 정상 결과를 반환했다.
- `AnalysisDetectionScheduler`의 시간창을 `BinanceKlineWindow.safeEnd()` 기준으로 보정했다.
  커밋 `12b88cb`가 push·배포됐고, 안전 경계에서 1440개 연속 봉을 확인했다.
- 관리자 데이터 gap 검사를 canonical `binance_kline_5m` 기준 `KLINE_5M`으로 전환했다.
  커밋 `27c6532`가 push·배포됐고, 관리자 화면과 DB shadow 비교에서 누락 0건을 확인했다.
- LLM 시장 분석에 `BinanceKlineInterval.ONE_DAY`와 `kline_1d` 스트림, 툴·시스템 프롬프트 허용
  범위를 추가했다. 커밋 `d255115` 완료, Spring Boot 전체 테스트 442개 통과. push·배포 완료.

### 다음 세션에서 할 일 (사용자가 요청, 다음으로 미룸)
1. **시간 표시를 KST로 변환** — 화면에 epoch ms(long)가 그대로 노출되는 곳이 남아있다는 지적.
   `formatTime` 헬퍼가 이미 적용된 곳과 안 된 곳을 구분해 확인 필요.
3. **결론 가독성 개선** — 시스템 프롬프트에 "5줄 이내 결론부터" 지침을 추가했으나, 사용자가
   화면에서 아직 개선을 체감 못함 — 재배포됐으니 다음에 재확인 필요.
4. **매수/매도 추천가격 표시** — `BinanceAnalysisChatClientConfig`의 현재 시스템 프롬프트는
   포지션 정보(방향·진입가·레버리지 등)가 없어 "정확한 손절가는 계산 못 한다"고 명시돼 있음
   (합의된 제약). 추천가격을 보여주려면 이 제약을 어떻게 풀지(포지션 정보를 입력받을지,
   계속 "기술적 후보"로만 표시할지) 사용자와 먼저 다시 확인해야 한다.

### 아직 안 한 것
- `chs/server/nginx/devcontext.conf`에 `/api/admin/test/binance/debug/analysis` 전용
  location 블록(60초 타임아웃)을 로컬 사본에 추가했으나 **실서버 반영은 아직 확인 안 됨**
  (nginx 설정은 git 배포 대상이 아니라 서버에서 직접 확인해야 함).

## binance signal — energy 히스토리 시작시각 + kline temp 정식화 (2026-09-03)

### 완료 — energy 히스토리 시작시각 지정
signal 페이지 long/short energy·청산 합계에 시작 시각을 직접 지정하는 기능. 계획→Codex
검수→구현까지 끝났고 이 세션에서 커밋됨(`SignalController`/`SignalDataService`/`SignalPage`
/`TopBar` + signal 전용 `datetimeLocal` 모듈). 캔들·OI 차트는 기존 프리셋 그대로 유지.

### 계획 v3 (1~7단계 구현 완료, 운영 배포 확인 필요) — kline temp 표 정식화 (다음 세션에서 이어감, 2026-09-04)
`agg_trade_1m_temp`가 설계상 "임시"인데 2026-08-31 raw tick 중단 이후 사실상 유일한
실시간 kline 원천이 됨(전체 행을 자바로 읽는 구조라 512MB 힙 제약에서 위험). 표 이름
`binance_kline_5m` 확정. Codex xhigh 적대적 검수(2026-09-04) 결과 v2는 처음엔 **보류** —
`SignalCandleSource` 인터페이스만 지키면 된다는 v2의 GitNexus 기반 전제가 불완전했다(이
인터페이스를 우회해 legacy 표를 직접 읽는 `PatternMatchService`·`AnalysisSearchService`를
놓쳤고, `DataIntegrityEvaluator`(60분)·`AnalysisDetectionScheduler`(1440분)가 요구하는
1분 범위, 진행봉(IN_PROGRESS) 경로도 계획에 없었다). 재작성한 v3(`docs/binance/
kline-temp-retire-plan.md`)에 9단계 실행 순서를 정리하고, 사용자 결정 필요 3가지
(PatternMatch·AnalysisSearch 포함 / SPOT+FUTURES 유지 / `KLINE_5M` 표기 변경)를 모두
확정(가/가/가) — 1~7단계 구현과 로컬 검증을 완료했으며, **운영 배포 확인이 남아 있다**.
2단계(기준선 실측)도 완료 — `springboot/.env` 로컬 자격으로 공유 DB 직접 조회(읽기 전용).
실측 대상은 `BTCUSDT`·`ENAUSDT` × `SPOT`·`FUTURES` 4개 조합뿐이며, legacy
`agg_trade_1m`/`agg_trade_5m`가 cutover 이후 약 3.44일째 정지 상태임을 확인해 치명 2·3
(PatternMatch·AnalysisSearch 고립)이 실측으로 재확인됨. 15분 AnalysisTemplate delta는
자바 집계 대신 SQL GROUP BY 전환을 권장하는 결론으로 "미확정 사항" 해소.
3단계(interval 공통 계층)도 완료 — `BinanceKlineRestClient`·`BinanceKlineRangeFetcher`·
`BinanceKlineWindow`에 `BinanceKlineInterval`(기존 enum, `FIVE_MINUTES` 이미 있음)을 받는
오버로드를 additive로 추가, 기존 1분 경로는 시그니처·동작 변경 없음. 테스트 4개 클래스
(계획엔 3종만 적혀 있었으나 `BinanceKlineTempSyncServiceTest`도 mock stub 갱신 필요해서
같이 처리) 29개 전부 통과, compile 통과.
4단계(마이그레이션+repository)도 완료 — `V11__add_binance_kline_5m.sql` + `BinanceKline5m`
entity + `BinanceKline5mRepository` 신설, 순수 additive라 기존 코드 영향 없음. (이후 배포로
실제 DB에도 적용 완료 — 아래 6단계 문단 참고.)
5단계(writer·sync)도 완료 — `BinanceKline5mWriter`+`BinanceKline5mSyncService` 신설.
"tail vs gap 별도 경로"가 아니라 "매 회차 최근 48시간 전체를 리필"하는 단일 경로로 구현
(RefillResult 5개 지표, gap 병합, 회차당 20-range 상한, range마다 리더 재확인, 429/5xx
재시도, manualRefill 팔로워 차단). 커밋 전 Codex commit-check(xhigh)로 결함 2건 추가 수정
(상태 조회 실패 격리, 쓰기 직전 리더 재확인). 테스트 11개 신규 통과, binance 도메인 전체
207개 회귀 없음. (배포 후 스케줄러가 실제로 동작한 것은 아래 6단계 문단에서 확인.)
6단계(1분·진행봉 경로 보존)도 완료 — 검증만 하고 **새 코드는 안 씀**: `DataIntegrityEvaluator`
·`AnalysisDetectionScheduler`가 `Interval.ONE_MINUTE`만 쓰는 걸 재확인(이번 v3가 ONE_MINUTE
읽기 경로를 애초에 안 건드려서 구조적으로 무영향, 기존 테스트 7개 그대로 통과), 진행봉은
7단계에서 IN_PROGRESS를 canonical로 안 옮기고 지금 1분-temp 경로에 남기기로 확정. "50분
이하만 REST" 옛 설계는 폐기(1분 temp 전량 유지로 대체).
**이 세션에서 실제로 배포됨(6865d5b, f48e080)** — 배포 후 DB 직접 조회로 확인: V11
마이그레이션 성공 적용, `binance_kline_5m`에 4개 조합 각 576개(48시간) 정상 채워짐(shadow
read parity 0건 불일치), 기존 1분 temp 회귀 없음.

**배포 중 별도로 발견·해결한 것(kline_5m과 무관, 기존 설계 문제)**: 배포 직후
`AnalysisDetectionScheduler`가 BTCUSDT·ENAUSDT "1440개 결측/불연속" WARN을 계속 찍는
현상 발견 → 맥미니 원격 세션 + Codex(진단 2라운드, effort=high)로 근본 원인 규명:
1분 temp 수집기의 설계상 신선도 지연(3~5분, 안전지연 2분+tick 위상)과
`AnalysisDetectionScheduler`의 "지금 이 순간 기준 정확히 1440개" 요구가 애초에 계약
불일치였던 것 — 내부 결측은 없음, 오탐. kline_5m 작업과 무관하다고 Codex가 결론(리더
강제전환·1분 경로 추가조사 모두 근거 없음이라 기각). **후속 과제로 별도 분리**: 이
탐지기의 시간창 정의를 손봐야 함(신선도 지연을 계약으로 인정하거나 창 정의를 바꾸거나) —
이번 계획 문서 범위 밖.

7단계(source 읽기 전환)도 **부분 완료** — 착수 전 Codex xhigh 계획 검수로
`binance_kline_5m`이 최근 48시간 롤링 윈도우만 유지해 cutover~48시간전 사이 487개
캔들이 비어있는 걸 발견, 백필부터 하기로 결정(하이브리드 폴백은 기각).
- `BinanceKline5mSyncService.manualBackfillRange()` 신설(기존 리필 로직 `refillRange()`로
  공통 추출·재사용) + `ManualBackfillService`에 `KLINE_5M` 타입 추가(기존 admin API 재사용,
  새 컨트롤러 없음). **백필 실행 완료(2026-09-04, c102bb7 배포 뒤 맥미니 원격 세션이
  리더 인스턴스에서 4건 실행)** — DB 재확인: 4개 조합 전부 487/487, 표 전체가
  2026-08-31 12:50부터 지금까지 완전 연속. 실행 중 관리자 화면에 `KLINE_5M` 옵션이 없어
  첫 시도가 실수로 `KLINE_1M`(1분 temp)에 153건 들어갔으나 이미 채워진 구간이라 무해
  확인(INSERT IGNORE)했다. `ManualCollectCard.jsx`에는 `KLINE_1M`·`KLINE_5M` 옵션이 이미
  존재해 추가 수정하지 않았다.
- `BinanceKlineSignalCandleSource`의 5분 COMPLETED 읽기를 canonical로 전환 완료
  (IN_PROGRESS·1분은 기존 temp 경로 그대로). `AnalysisTemplateService.getDelta()`에
  5분/15분 90일 상한 추가(무제한 조회 시 512MB 힙 위험 완화 — Codex 지적, SQL GROUP BY
  전환은 이번엔 보류).
- **PatternMatchService·AnalysisSearchService 전환과 주요 운영 확인 완료** — 두 서비스 모두
  `SignalCandleSource`를 사용해 cutover 이전 legacy 표와 이후 canonical/temp 표를 같은
  계약으로 읽는다. 장기 분석 검색은 7일 단위로 나눠 읽어 힙 적재를 제한하고, 전환 후
  호출되지 않는 legacy 유사 검색 repository 메서드는 삭제했다. `/api/analysis/search` 실제
  운영 요청도 정상 결과를 반환하는 것을 확인했다.
- 분석 화면의 심볼은 `BTCUSDT`·`ENAUSDT` 전체 형식으로 통일했고, API 경계에서는 짧은
  심볼도 한 번 정규화한다. 검색의 거래량 조건은 차트와 같은 base volume 단위를 사용한다.
- 커밋 전 Codex commit-check(xhigh)로 결함 3건 추가 수정(in-flight 충돌 시 거짓 성공,
  manualBackfillRange 자체 경계 검증 부족, 90일 상한 계산 오버플로).
- springboot 전체 테스트 스위트(442개) 통과.

**이 세션에서 추가로 확인됨**: `/api/signal/candles`(5m·15m) 72시간 범위 실운영 조회 —
5분봉 861개·15분봉 286개 전부 간격 이상·null/0-캔들 0건, 백필 경계 포함 완전 연속. 7단계
(부분) 작업은 이걸로 실제 검증까지 끝남.

**다음 세션 할 일**:
1. 9단계 dual-write·rollback 검증과 old temp 보관 기간 정책을 확정.
2. `d255115` push·배포 후 LLM 일봉 인터벌 운영 확인.
**죽음조건: 구현·배포가 끝나면 이 절과 `docs/binance/kline-temp-retire-plan.md`를 지운다.**
