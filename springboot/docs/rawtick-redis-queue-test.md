# RawTick Redis 공유 큐 — 테스트 시나리오

## 사전 준비

- MySQL: `raw_tick` 테이블에 **기존 데이터가 있으면** unique 추가 시 ALTER 실패 가능 → **서버 기동 전** `TRUNCATE TABLE raw_tick` 실행.
- Redis: 정상 기동, `rawtick:queue` 키 사용 가능한지 확인.
- 환경변수: `DATASOURCE_*`, `REDIS_HOST` 등 적용된 상태.

---

## 1. 단일 서버 기동

1. 애플리케이션 기동.
2. 로그 확인:
   - `[BinanceTrade] SPOT 연결 성공`, `FUTURES 연결 성공`
   - `[리더 획득]` (LeaderElectionService)
   - 약 10초마다 `[RawTick] 배치 저장 완료: N건, Nms` (리더이면)
3. Redis: `LLEN rawtick:queue` — 수신 중이면 0 근처에서 왔다 갔다 하거나, 10초마다 줄었다 늘었다 하는 패턴.
4. DB: `SELECT COUNT(*) FROM raw_tick` — 시간 지나면 건수 증가.

**기대**: WS 수신 → enqueue(RPUSH) → 10초마다 리더가 LPOP·batchInsert → DB 적재.

---

## 2. enqueue 오류 격리 (Producer)

1. Redis 일시 중단 또는 `rawtick:queue`에 잘못된 타입 설정 등으로 RPUSH 실패 유도.
2. 로그: `[RawTick] enqueue 실패: ...` 발생.
3. 로그: `[BinanceTrade] RawTick enqueue 실패: ...` (BinanceTradeService try-catch).
4. **parseAndSave / WS request(1)은 계속 동작** — 대형 체결 수집·SSE는 유지.

**기대**: RawTick 1건 유실만 있고, WS 연결·parseAndSave·request(1)은 정상.

---

## 3. 리더 전환 (Consumer)

1. 서버 2대 기동 (동일 Redis·DB).
2. 한 대만 리더 로그 `[리더 획득]`, 10초마다 `[RawTick] 배치 저장 완료` 로그는 **리더 한 대에서만** 출력.
3. 리더 프로세스 종료.
4. 다른 인스턴스가 리더 획득 후, **같은** `rawtick:queue`를 이어서 LPOP·저장.

**기대**: 리더 전환 후에도 큐 소비 끊기지 않고, DB 적재 이어짐.

---

## 4. 큐 경고 알림 (10% 구간)

1. Redis에 테스트 데이터 대량 RPUSH로 `rawtick:queue` 길이를 5,000건 이상으로 만듦 (또는 트래픽이 많은 환경에서 대기).
2. 5,000건 이상이 되면 `tryAlertQueueWarn` — Telegram 알림: `큐 N건 — 10% (5000건 구간)` 등.
3. 동일 구간(bucket)은 60초 쿨다운 동안 한 번만 알림.
4. 10,000 / 15,000 / … 50,000 구간별로 다른 키(`rawtick:alert:queue-warn:1` ~ `:10`) → 구간별 60초 쿨다운.

**기대**: 5천 건 이상 시 구간별 알림 1회, 쿨다운 후 같은 구간에서만 재알림.

---

## 5. 큐 오버플로우 (50,000건 초과)

1. `rawtick:queue`를 50,000건 넘게 쌓이게 함 (수신량 많거나, Consumer 잠시 중단).
2. enqueue 시 `newSize > 50_000` → LTRIM으로 오래된 것 드롭, `tryAlertOverflow()` → Telegram: `큐 오버플로우 — 오래된 틱 드롭 중`.
3. **같은 시점에는** `tryAlertQueueWarn` 호출 안 함 (if / else if 분기).

**기대**: 50,000건 초과 시 LTRIM 적용, overflow 알림 1회(60초 쿨다운).

---

## 6. batchInsert 실패 (Consumer)

1. DB 장애 또는 `raw_tick` 테이블 일시 불용 등으로 INSERT 실패 유도.
2. 로그: `[RawTick] 배치 insert 실패: N건, Nms` + 스택.
3. Telegram: `배치 insert 실패: N건, Nms` (60초 쿨다운).
4. 해당 회차 배치는 폐기, 10초 후 다음 LPOP 회차 재시도.

**기대**: insert 실패 시 알림 한 번, 해당 배치만 버리고 다음 주기에 재시도.

---

## 7. 비리더에서 scheduleFlush

1. 비리더 인스턴스 로그 확인.
2. 10초 주기로 scheduleFlush는 실행되지만 `leaderElection.isLeader() == false`로 **즉시 return**.
3. `[RawTick] 배치 저장 완료` 로그는 **리더에서만** 출력.

**기대**: 비리더는 LPOP·DB 저장 없이 return만 반복.

---

## 8. 서버 종료 시 동작

1. 리더 서버 종료.
2. `destroy()`: flushExecutor shutdown → awaitTermination(30초) → 필요 시 shutdownNow.
3. Redis 큐 데이터는 유지 → 새 리더가 이어서 소비 (drain 불필요).

**기대**: 종료 시 추가 drain 없이, 재기동·다른 리더가 같은 큐 이어서 소비.

---

## 9. 중복 틱 (멀티 서버 동시 push)

1. 여러 서버가 동일 틱을 각각 RPUSH → Redis 리스트에 동일 trade_id·market_type 중복 가능.
2. 리더가 LPOP·batchInsert 시 `ON DUPLICATE KEY UPDATE id = id` (uq_rawtick)로 중복 행은 no-op.

**기대**: DB에는 (trade_id, market_type)당 1건만 유지.

---

## 요약 체크리스트

| 항목 | 확인 |
|------|------|
| 단일 서버: WS 수신 → Redis RPUSH → 10초마다 리더가 LPOP·DB 저장 | |
| enqueue 실패 시 해당 틱만 유실, parseAndSave·request(1) 정상 | |
| 리더 전환 후에도 같은 큐 이어서 소비 | |
| 큐 5,000건 이상 시 구간별 경고 알림(60초 쿨다운) | |
| 큐 50,000건 초과 시 LTRIM·overflow 알림, warn 미발송 | |
| batchInsert 실패 시 알림·해당 회차 스킵·다음 주기 재시도 | |
| 비리더는 scheduleFlush에서 즉시 return | |
| 서버 종료 시 Redis 큐 유지, 새 리더가 이어서 소비 | |
| 멀티 서버 동일 틱 → DB unique로 1건만 유지 | |
