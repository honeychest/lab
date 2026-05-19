# Logistics 도메인 — 남은 작업

> 갱신: 2026-05-19

## 도메인 모델 (전제)

- WMS = 창고 중심. **OMS = 출고 trigger**(재고 감소), **EOS = 입고 trigger**(재고 증가).
- `EOS_PIPELINE = EOS_STAGES + INBOUND_STAGES` — 발주 후 실물이 와서 INBOUND로 입고되는 한 흐름.

---

## 1. 리팩토링 (먼저)

INBOUND부터 분리해 queue 패턴 검증 → 통과 시 OMS/WMS/QMS/TMS/EOS 점진 마이그레이션.

| 단계 | 작업 | 산출 |
|---|---|---|
| 1 | (완료) in-memory queue 추상 | `frontend/src/domain/logistics/common/queue.ts` |
| 2 | `domain/inbound/` 모듈 + `subscribe('inbound.*')` consumer | 신규 폴더 |
| 3 | consumer에서 work node 진행 로직 (출고 `advanceWmsWorkNode` 참고) | consumer 안 |
| 4 | `tickLoop`의 INBOUND 분기 제거 (`tickLoop.ts:135-142` 등) | tickLoop 슬림 |
| 5 | `events.ts`에 `InboundWorkNodeKey` union 추가 | 타입 안전 |
| 6 | 검증 후 다른 5도메인 마이그레이션 | 점진 |

**원칙**: queue 1개. routing key + consumer 경계로 도메인 분리. routing key 규칙 `<domain>.<event>`.

---

## 2. 리팩토링 후 — WMS 입고 완료 처리 보강

출고(`WMS_COMPLETED`)는 work node 3개(`stock-confirm`/`audit-close`/`order-close`)로 마무리하는데 입고(`INBOUND_COMPLETED`)는 finalStage라 도달 즉시 `status='completed'`로 마감 → 마무리 절차 패스.

**INBOUND_COMPLETED에 추가할 마무리 work node 3종**:
- `stock-apply-confirm` — 재고 반영 확정 (출고 stock-confirm 대응)
- `audit-close` — 입고 감사 로그
- `eos-close-handoff` — EOS측 "입고 완결" 통보 (출고 order-close 대응)

**구현 위치**: 리팩토링으로 분리된 `domain/inbound/` consumer 안. tickLoop에 평행 코드 추가 금지 (모놀리식 심화).

**부수 점검**: `failures.ts`에 INBOUND_COMPLETED 단계 실패 매핑 있는지.

---

## 3. 그 외

- queue snapshot UI 패널 (디버그/관측용, 작은 floating panel)
- `InboundStageGrid` 마운트 완료 (WmsTab에서 focused task 기준 입/출고 자동 swap). 추가 시각화 필요 시 여기 추가
