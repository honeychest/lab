# 매 틱(RawTick) 저장 로직에서 Redis의 역할

## 1. 전체 흐름 요약

```
[Binance WS] → 매 틱 수신
      ↓
[BinanceTradeService] onText() → rawTickStorageService.enqueue(json, marketType)
      ↓
[Redis List] key = "rawtick:queue"  ← RPUSH (모든 서버가 넣음)
      ↓
[RawTickStorageService] 10초마다 scheduleFlush()  ← 리더 서버만 실행
      ↓
LPOP 최대 1만 건씩 → 파싱 → MySQL 배치 INSERT (raw_tick 테이블)
```

- **Producer(넣는 쪽)**: Binance WebSocket에서 틱이 올 때마다 **모든 인스턴스**가 `enqueue()` → Redis 리스트 **오른쪽(RPUSH)** 에 넣음.
- **Consumer(빼는 쪽)**: **리더로 선출된 한 대**만 10초마다 `scheduleFlush()`에서 Redis 리스트 **왼쪽(LPOP)** 으로 꺼내서 DB에 배치 저장.

---

## 2. Redis가 하는 일 (역할 정리)

### 2-1. 공유 큐 (메인 역할)

| 항목 | 내용 |
|------|------|
| **키** | `rawtick:queue` |
| **자료구조** | List (양쪽 삽입/삭제) |
| **넣는 쪽** | `RPUSH` — 모든 서버가 WS 수신 시마다 호출 |
| **빼는 쪽** | `LPOP key count` — 리더만 최대 1만 건씩 꺼냄 |

- 여러 서버가 **같은 Redis**를 쓰기 때문에, 어느 서버에서 받은 틱이든 **한 큐**에 모임.
- **한 서버만** 리더이므로, 그 서버만 큐를 소비해 DB에 넣어서 **중복 저장·경쟁**을 막음.

→ **역할**: “모든 인스턴스가 넣고, 한 인스턴스만 꺼내서 DB에 저장”하는 **분산 큐**.

---

### 2-2. 큐 길이 제한·오버플로우 알림

| 동작 | Redis 사용 |
|------|------------|
| 큐 길이 > 50,000 | `LTRIM rawtick:queue -50000 -1` 로 오래된 항목 잘라냄 + 텔레그램 알림(쿨다운 60초) |
| 큐 5,000건 이상 | 5,000건 단위 구간별로 “큐 80%” 같은 경고 알림(Redis 쿨다운 키로 중복 알림 방지) |

- Redis List 길이를 재는 것과 `LTRIM`으로 **메모리/적체 상한**을 둠.

---

### 2-3. 알림 쿨다운 (같은 알림 반복 방지)

| 키 예시 | 용도 | TTL |
|---------|------|-----|
| `rawtick:alert:overflow` | 큐 오버플로우 알림 | 60초 |
| `rawtick:alert:insert-fail` | 배치 insert 실패 알림 | 60초 |
| `rawtick:alert:queue-warn:1`, `...:2` … | 큐 5천/1만/… 건 구간 경고 | 60초 |

- `SET key "1" NX EX 60` 으로 “이 키가 없을 때만 설정하고 60초 유지”.
- 같은 이벤트가 60초 안에 다시 나와도 **한 번만** 알림 보내도록 함 (분산 환경에서도 동작).

---

## 3. 로직 단계별 정리

### 3-1. 틱이 들어올 때 (Producer)

1. **BinanceTradeService**  
   - 현물(@trade) / 선물(@aggTrade) WebSocket에서 **매 메시지**마다 `onText()` 호출.
2. **rawTickStorageService.enqueue(json, marketType)**  
   - `QueueItem(marketType, json)` 을 JSON 문자열로 직렬화.
   - `RPUSH rawtick:queue value` → Redis 리스트 **오른쪽**에 추가.
   - 반환된 리스트 길이(`newSize`)로:
     - `> 50_000` → `LTRIM` + 오버플로우 알림 시도.
     - `>= 5_000` → 구간별 큐 경고 알림 시도(쿨다운 키 사용).

→ 이 단계에서 Redis는 **버퍼**: DB에 바로 쓰지 않고 **큐에만 넣음**.

---

### 3-2. 주기적으로 DB에 저장 (Consumer)

1. **스케줄**  
   - `RawTickStorageService` 생성 시 `flushExecutor.scheduleWithFixedDelay(scheduleFlush, 10, 10, SECONDS)`  
   - **10초마다** `scheduleFlush()` 실행.
2. **리더만 실행**  
   - `if (!leaderElection.isLeader()) return;`  
   - 리더는 `LeaderElectionService`가 Redis로 선출 (다른 문서 참고). 리더 한 대만 아래 로직 수행.
3. **큐에서 꺼내기**  
   - `LPOP rawtick:queue 10000` → 최대 1만 건을 **한 번에** 꺼냄.
   - 꺼낸 게 없으면 `break`; 있으면 다음 단계.
4. **파싱**  
   - 각 문자열을 `QueueItem` → `RawTick` 으로 파싱 (바이낸스 필드: t, p, q, m, T 등).
5. **DB 저장**  
   - `batchInsert(entities)` → `INSERT INTO raw_tick (...) VALUES (...), (...), ... ON DUPLICATE KEY UPDATE id=id`  
   - `(trade_id, market_type)` unique로 중복은 무시.
6. **반복**  
   - 한 번에 1만 건 미만이 나올 때까지 위 LPOP → 파싱 → 배치 INSERT 반복 후 종료.

→ Redis는 여기서 **소비되는 큐**: 리더가 LPOP으로만 꺼내므로, 한 틱이 한 번만 DB에 들어감.

---

### 3-3. 리더 선출 (Redis 사용, RawTick과는 별도 키)

- **LeaderElectionService**: `telegram:leader` 키로 Redis SETNX(+ TTL) 사용.
- RawTick **Consumer**가 “한 대만” 돌게 하려고 `leaderElection.isLeader()`를 쓰는 것일 뿐, **큐 자체**는 `rawtick:queue` 하나만 사용.

---

## 4. Redis를 쓰는 이유 (왜 DB에 바로 안 넣나?)

| 목적 | 설명 |
|------|------|
| **인스턴스 여러 대** | WS는 각 서버가 따로 받음. Redis 큐가 “모든 서버의 틱”을 한 곳에 모아서, **한 서버만** DB에 쓰게 함. |
| **DB 부하 완화** | 틱 하나마다 INSERT 하지 않고, **10초마다 최대 1만 건 배치**로 넣어서 DB round-trip·인덱스 부하를 줄임. |
| **피크 완충** | 순간적으로 틱이 많이 들어와도 Redis 메모리에 쌓았다가, 리더가 일정 개수씩 꺼내 저장. |
| **단일 Consumer** | 리더만 LPOP 하므로, “누가 저장할지”를 Redis 리스트 하나로 일원화.

---

## 5. 사용하는 Redis 키·연산 요약

| 키 | 타입 | 연산 | 용도 |
|----|------|------|------|
| `rawtick:queue` | List | RPUSH, LPOP count, LTRIM, LLEN(간접) | 틱 메시지 큐 |
| `rawtick:alert:overflow` | String | SET key 1 NX EX 60 | 오버플로우 알림 쿨다운 |
| `rawtick:alert:insert-fail` | String | SET key 1 NX EX 60 | insert 실패 알림 쿨다운 |
| `rawtick:alert:queue-warn:{n}` | String | SET key 1 NX EX 60 | 큐 구간 경고 알림 쿨다운 |

---

## 6. 한 줄 요약

- **Redis 역할**:  
  “모든 서버가 매 틱을 **넣는(RPUSH) 공유 큐** + **리더 한 대만 꺼내서(LPOP)** MySQL에 배치 저장 + 알림 쿨다운용 키.”
- **로직**:  
  WS → enqueue (RPUSH) → 10초마다 리더가 LPOP → 파싱 → batch INSERT.
