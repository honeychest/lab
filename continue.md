# Continue — Kafka Event Pipeline Prep

다음 세션에서 바로 이어갈 작업:

## 현재 결정

- Kafka는 앱 compose가 아니라 인프라 compose에 둔다.
- 서버 인프라 compose 위치: `/home/ubuntu/docker-compose.yml`
- 로컬 인프라 compose 원본: `chs/server/docker-infra.yml`
- 서버 앱 compose 위치: `/home/ubuntu/project/home/springboot/docker-compose.yml`
- 로컬 앱 compose 원본: `chs/server/springboot/docker-compose.yml`
- 서버 프로젝트 루트: `/home/ubuntu/project/home`
- 서버 접속 표기: `ubuntu@devcontext.duckdns.org`

## 현재 변경 상태

로컬 파일 기준:

- `chs/server/docker-infra.yml`
  - Kafka 서비스 추가됨.
  - `apache/kafka:3.8.1`
  - 단일 노드 KRaft 모드.
  - memory `1536M`, heap `-Xms512m -Xmx512m`.
  - `kafka-data:/var/lib/kafka/data`.
- `chs/server/springboot/docker-compose.yml`
  - Kafka 서비스는 제거됨.
  - 앱 공통 환경변수에 `KAFKA_BOOTSTRAP_SERVERS: kafka:9092`만 있음.
- `springboot/build.gradle`
  - `implementation 'org.springframework.kafka:spring-kafka'` 추가됨.
- `springboot/src/main/resources/application.properties`
  - `spring.kafka.*` 기본 설정 추가됨.

## 문서 위치

기준 문서 폴더:

```text
obsidian/20. Project/kafka-event-pipeline-prep
```

우선 읽을 문서:

1. `README.md`
2. `02-server-kafka-setup-runbook.md`
3. `03-application-refactor-plan.md`
4. `04-operational-notes.md`

## 다음 작업 순서

1. 로컬 compose 정합성 확인
   - `docker compose -f chs/server/docker-infra.yml config --services`
   - `docker compose --project-directory springboot -f chs/server/springboot/docker-compose.yml config --services`
   - 기대:
     - infra: `db`, `kafka`, `rabbitmq`, `redis`
     - app: `app1`, `app2`, `nexus`

2. 문서가 실제 파일과 맞는지 확인
   - `02-server-kafka-setup-runbook.md`의 경로와 명령이 위 결정과 맞는지 점검.
   - `chs/`는 `.gitignore` 대상이므로 compose 변경은 Git pull이 아니라 서버 대상 파일로 직접 복사해야 함.

3. 필요하면 서버 반영 전 커밋 또는 scp 전략 결정
   - Git 반영이면 `/home/ubuntu/project/home`에서 `git pull`.
   - compose 파일은 서버 `/home/ubuntu/docker-compose.yml`, `/home/ubuntu/project/home/springboot/docker-compose.yml`에 별도 반영.
   - 서버 접속/복사/compose 실행/topic 생성/smoke test는 사용자가 수동 진행.

4. 서버 Kafka 준비
   - runbook의 `0. 로컬 변경 파일과 서버 반영 위치`부터 진행.
   - Kafka topic:
     - `market.aggtrade.raw`
     - `market.aggtrade.dlq`

5. 서버 Kafka smoke test 완료 후 앱 코드 전환 시작
   - `AggTradeStreamService`에 Kafka producer 추가.
   - 초기에는 기존 `storageService.enqueue(...)` 유지 + Kafka publish dual-write.
   - 그 다음 `raw-writer` consumer 구현.

## 주의

- Kafka 브로커 정의를 앱 compose에 다시 넣지 말 것.
- Redis는 원천 이벤트 보관 용도가 아니라 current metrics/cache 용도.
- OpenSearch/Loki/Grafana 등 분석도구는 AWS 8GB 환경에서는 보류.
- `9094`는 host debug용이다. AWS 보안그룹에 public open 하지 말 것.
