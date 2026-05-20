import type { LogisticsTask, TaskStage, OmsStage, InboundStage, WmsOutStage, QmsStage, TmsStage, EosStage, AftStage, OmsReceiveNodeKey, TmsWorkNodeKey, WmsWorkNodeKey, QmsWorkNodeKey, EosWorkNodeKey, AftWorkNodeKey } from './events';

export const OMS_STAGES: OmsStage[] = [
    'OMS_RECEIVED',
    'OMS_VALIDATED',
    'OMS_WMS_REQUESTED',
];

export type OmsReceiveWorkNode = {
    key: string;
    label: string;
    summary: string;
    signal: string;
    output: string;
    stage: number;
    dlog: string;
    handoff: string;
    description?: string;
};

// 1 tick = 100ms. 모든 단계/세부 노드가 같은 기준 시간을 참조한다.
export const LOGISTICS_STAGE_TICKS = 10;
export const OMS_RECEIVE_NODE_TICKS = LOGISTICS_STAGE_TICKS;
export const TMS_WORK_NODE_TICKS = LOGISTICS_STAGE_TICKS;
export const WMS_WORK_NODE_TICKS = LOGISTICS_STAGE_TICKS;
export const QMS_WORK_NODE_TICKS = LOGISTICS_STAGE_TICKS;
export const EOS_WORK_NODE_TICKS = LOGISTICS_STAGE_TICKS;
export const INBOUND_WORK_NODE_TICKS = LOGISTICS_STAGE_TICKS;
export const AFT_WORK_NODE_TICKS = LOGISTICS_STAGE_TICKS;

export const OMS_RECEIVE_WORK_NODES: OmsReceiveWorkNode[] = [
    {
        key: 'raw-ingest',
        label: '주문 원문 수신',
        summary: '외부 채널에서 들어온 주문 원문을 접수 큐에 올립니다.',
        signal: '원문 누락, 채널 불명',
        output: '접수 이벤트',
        stage: 2,
        dlog: 'OmsReceive.rawIngest — 주문 원문 수신/채널 payload 보존 구현 지점',
        handoff: '채널, 원문 ID, 수신 시각',
        description: '쇼핑몰·앱 등 외부 채널에서 "이 상품 주문이 들어왔어요"라는 데이터를 처음으로 받아 시스템에 기록하는 단계입니다.',
    },
    {
        key: 'owner-match',
        label: '화주·채널 식별',
        summary: '화주와 유입 채널을 계약 범위에 맞춰 식별합니다.',
        signal: '미등록 화주, 계약 불일치',
        output: 'owner key',
        stage: 2,
        dlog: 'OmsReceive.ownerMatch — 화주/채널/계약 식별 구현 지점',
        handoff: 'owner key, 계약 정책',
        description: '이 주문을 맡긴 고객사(화주)가 누구인지, 어느 경로(채널)를 통해 들어온 주문인지 계약 정보와 대조해 확인하는 단계입니다.',
    },
    {
        key: 'required-fields',
        label: '필수값 검사',
        summary: '품목, 수량, 도착지, 외부 주문키를 확인합니다.',
        signal: '필수값 누락, 형식 오류',
        output: '검증 후보',
        stage: 2,
        dlog: 'OmsReceive.requiredFields — OMS 접수 필수값 검증 구현 지점',
        handoff: '검증 결과, 반려 사유',
        description: '주문에 꼭 있어야 할 정보(무슨 물건, 몇 개, 어디로)가 빠지거나 잘못 적혀 있지 않은지 확인하는 단계입니다.',
    },
    {
        key: 'duplicate-check',
        label: '중복 주문 탐지',
        summary: '외부 주문번호를 접수 이력과 대조해 중복을 막습니다.',
        signal: '재전송, 멱등 충돌',
        output: '중복 판정',
        stage: 2,
        dlog: 'OmsReceive.duplicateCheck — 중복 주문 탐지/멱등 처리 구현 지점',
        handoff: '중복 여부, 기존 taskId',
        description: '같은 주문이 두 번 들어와 물건이 두 번 나가지 않도록, 이미 처리한 주문번호인지 이력과 대조해 걸러내는 단계입니다.',
    },
    {
        key: 'receipt-key',
        label: '접수키 발급',
        summary: '작업 추적용 taskId와 traceId를 만들고 이력 체인을 시작합니다.',
        signal: '키 충돌, 추적 단절',
        output: 'taskId / traceId',
        stage: 2,
        dlog: 'OmsReceive.receiptKey — 접수키/추적키 발급 구현 지점',
        handoff: 'taskId, traceId, event seed',
        description: '이 주문이 창고를 거쳐 배송될 때까지 전 과정을 추적할 수 있도록 고유 번호(접수키)를 만들어 붙이는 단계입니다.',
    },
    {
        key: 'sla-classify',
        label: 'SLA 분류',
        summary: '주문 긴급도와 SLA 등급을 분류해 처리 우선순위를 부여합니다.',
        signal: 'SLA 정책 불명, 등급 미지정',
        output: 'SLA 등급',
        stage: 3,
        dlog: 'OmsReceive.slaClassify — 화주 계약 SLA 등급/우선순위 분류 구현 지점',
        handoff: 'SLA 등급, 처리 우선순위',
        description: '당일배송·일반배송처럼 얼마나 빨리 처리해야 하는지 등급을 매겨, 급한 주문이 먼저 처리되도록 순서를 정하는 단계입니다.',
    },
    {
        key: 'next-queue',
        label: '검증 큐 등록',
        summary: '다음 검증 레인이 집어갈 이벤트를 생성합니다.',
        signal: '큐 적재 실패, 이벤트 유실',
        output: '검증 대기 작업',
        stage: 2,
        dlog: 'OmsReceive.nextQueue — OMS 검증 큐 등록/이벤트 발행 구현 지점',
        handoff: 'validation queue event',
        description: '접수를 마친 주문을 다음 단계인 검증 대기줄에 올려, 검증 작업자가 바로 이어서 처리할 수 있게 넘겨주는 단계입니다.',
    },
];

export const OMS_VALIDATE_WORK_NODES: OmsReceiveWorkNode[] = [
    {
        key: 'contract-rule',
        label: '계약 조건 확인',
        summary: '화주 계약과 주문 채널 허용 범위를 확인합니다.',
        signal: '계약 불일치',
        output: '계약 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.contractRule — 화주 계약/채널 정책 검증 구현 지점',
        handoff: '계약 ID, 허용 채널',
        description: '이 주문을 맡긴 고객사와 맺은 계약 내용(어떤 상품을, 어느 경로로 받을 수 있는지)에 어긋나지 않는지 확인하는 단계입니다.',
    },
    {
        key: 'item-rule',
        label: '품목 정책 확인',
        summary: '품목 코드와 취급 가능 조건을 확인합니다.',
        signal: '미등록 품목',
        output: '품목 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.itemRule — 품목 정책/취급 가능 조건 구현 지점',
        handoff: 'item policy, 보관 온도',
        description: '주문한 물건이 우리 창고에서 다룰 수 있는 상품인지(냉동 보관 필요 여부 등 조건 포함) 확인하는 단계입니다.',
    },
    {
        key: 'quantity-rule',
        label: '수량·단위 확인',
        summary: '주문 수량과 단위가 처리 가능한 범위인지 확인합니다.',
        signal: '수량 초과, 단위 오류',
        output: '수량 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.quantityRule — 수량/단위 검증 구현 지점',
        handoff: '수량 범위, 단위',
        description: '주문 수량이 너무 많거나 단위(개/박스/팔레트)가 잘못 적혀 있지 않은지 처리 가능한 범위인지 확인하는 단계입니다.',
    },
    {
        key: 'destination-rule',
        label: '배송지 가능권 확인',
        summary: '배송지와 서비스 가능 권역을 대조합니다.',
        signal: '권역 불가',
        output: '배송지 검증 결과',
        stage: 2,
        dlog: 'OmsValidate.destinationRule — 배송 가능 권역 검증 구현 지점',
        handoff: '권역 코드, 제한 사유',
        description: '주문에 적힌 배송지 주소가 우리가 실제로 배달할 수 있는 지역인지 확인하는 단계입니다.',
    },
    {
        key: 'payment-check',
        label: '결제 상태 확인',
        summary: '주문에 연결된 결제 상태를 확인해 미결제/취소 건을 걸러냅니다.',
        signal: '결제 미확인, 결제 취소',
        output: '결제 상태',
        stage: 3,
        dlog: 'OmsValidate.paymentCheck — 결제 상태 조회/미결제 반려 구현 지점',
        handoff: '결제 ID, 결제 상태',
        description: '고객이 실제로 결제를 완료했는지 확인해, 아직 결제가 안 됐거나 취소된 주문은 걸러내는 단계입니다.',
    },
    {
        key: 'audit-ready',
        label: '검증 감사 기록',
        summary: '검증 결과와 반려 후보를 감사 로그로 남깁니다.',
        signal: '감사 누락',
        output: '검증 완료 이벤트',
        stage: 2,
        dlog: 'OmsValidate.auditReady — 검증 감사 로그/반려 사유 구현 지점',
        handoff: '검증 결과, 감사 로그',
        description: '검증 결과(통과/반려)와 반려 이유를 나중에 확인할 수 있도록 기록으로 남기는 단계입니다.',
    },
];

export const OMS_WMS_REQUEST_WORK_NODES: OmsReceiveWorkNode[] = [
    {
        key: 'shipment-build',
        label: '출고 요청 구성',
        summary: '검증된 주문을 WMS 출고 요청 payload로 구성합니다.',
        signal: 'payload 누락',
        output: 'shipment request',
        stage: 2,
        dlog: 'OmsWmsRequest.shipmentBuild — WMS 출고 요청 payload 구성 구현 지점',
        handoff: '출고 요청 payload',
        description: '검증을 통과한 주문 정보를 창고(WMS)가 이해할 수 있는 형식으로 바꿔 "이 상품 내보내 주세요" 요청서를 만드는 단계입니다.',
    },
    {
        key: 'inventory-hint',
        label: '재고 힌트 첨부',
        summary: '후속 WMS 할당에 필요한 품목·수량 힌트를 붙입니다.',
        signal: '품목 힌트 누락',
        output: 'allocation hint',
        stage: 2,
        dlog: 'OmsWmsRequest.inventoryHint — 재고 할당 힌트 구성 구현 지점',
        handoff: '품목, 수량, 온도대',
        description: '창고가 재고를 더 빠르게 찾을 수 있도록 "이 상품 몇 개, 냉장 구역에 있음" 같은 힌트 정보를 요청서에 함께 첨부하는 단계입니다.',
    },
    {
        key: 'event-envelope',
        label: '이벤트 봉투 생성',
        summary: 'routingKey, trace, idempotency 정보를 묶습니다.',
        signal: 'trace 단절',
        output: 'event envelope',
        stage: 2,
        dlog: 'OmsWmsRequest.eventEnvelope — 이벤트 봉투/멱등키 구현 지점',
        handoff: 'routingKey, traceId, idempotencyKey',
        description: '요청 메시지가 어디서 와서 어디로 가는지, 혹시 두 번 전달돼도 중복 처리되지 않도록 식별 정보를 봉투처럼 감싸는 단계입니다.',
    },
    {
        key: 'broker-send',
        label: 'WMS 이벤트 발행',
        summary: 'WMS가 수신할 출고 요청 이벤트를 발행합니다.',
        signal: '브로커 발행 실패',
        output: 'order.wms.requested',
        stage: 2,
        dlog: 'OmsWmsRequest.brokerSend — MQ/WS 이벤트 발행 구현 지점',
        handoff: '발행 결과, 재시도 키',
        description: '완성된 출고 요청 메시지를 창고 시스템(WMS)에 실제로 전송하는 단계입니다. 편지를 우체통에 넣는 것과 같습니다.',
    },
    {
        key: 'handoff-watch',
        label: '승계 확인',
        summary: 'WMS 접수 카드 생성 여부를 확인할 추적점을 남깁니다.',
        signal: 'WMS 미수신',
        output: 'WMS 접수 대기',
        stage: 2,
        dlog: 'OmsWmsRequest.handoffWatch — WMS 수신 확인/미수신 보상 구현 지점',
        handoff: 'WMS 수신 상태',
        description: '창고 시스템이 요청을 잘 받았는지 확인하는 단계입니다. 편지를 보낸 후 상대방이 받았다는 답장을 기다리는 것과 같습니다.',
    },
];

export const OMS_STAGE_WORK_NODES: Record<OmsStage, OmsReceiveWorkNode[]> = {
    OMS_RECEIVED: OMS_RECEIVE_WORK_NODES,
    OMS_VALIDATED: OMS_VALIDATE_WORK_NODES,
    OMS_WMS_REQUESTED: OMS_WMS_REQUEST_WORK_NODES,
};

export type QmsWorkNode = {
    key: string;
    label: string;
    summary: string;
    signal: string;
    output: string;
    stage: number;
    dlog: string;
    handoff: string;
    description?: string;
};

const QMS_REQUESTED_WORK_NODES: QmsWorkNode[] = [
    { key: 'request-ingest', label: '검사 요청 수신', summary: 'WMS 패킹 완료 이벤트를 수신해 QMS 처리 대상으로 등록합니다.', signal: '이벤트 미수신, 중복 요청, 연결 단절', output: '검사 요청 이벤트', stage: 2, dlog: 'QmsRequested.requestIngest — WMS 패킹완료 이벤트 수신/QMS 등록 구현 지점', handoff: 'taskId, 원문 이벤트, 수신 시각', description: 'WMS에서 포장이 끝났다는 신호를 받아 QMS가 이 건을 품질 검사 대상으로 처음 접수하는 단계입니다.' },
    { key: 'batch-lookup', label: '배치 정보 조회', summary: '검사 대상 배치·로트 정보를 조회해 품목·수량을 확인합니다.', signal: '배치 정보 없음, 품목 불일치', output: '배치·로트 정보', stage: 2, dlog: 'QmsRequested.batchLookup — 배치/로트 정보 조회 구현 지점', handoff: '배치 ID, 품목 코드, 수량', description: '이 검사 건이 어떤 상품 묶음(배치)인지, 몇 개인지를 시스템에서 조회해 검사 계획의 기준 정보를 만드는 단계입니다.' },
    { key: 'policy-match', label: '검사 정책 매칭', summary: '품목·화주 조건으로 적용할 검사 정책 룰셋을 결정합니다.', signal: '정책 미등록, 화주 정책 불명', output: '검사 정책 ID', stage: 2, dlog: 'QmsRequested.policyMatch — 검사 정책 룰셋 매칭 구현 지점', handoff: '정책 ID, 검사 기준 버전', description: '이 상품과 고객사에 어떤 검사 규칙을 적용할지 정책 테이블에서 찾아 결정하는 단계입니다.' },
    { key: 'inspection-type-classify', label: '검사 유형 분류', summary: '전수·AQL·샘플 중 이번 배치에 적용할 검사 유형을 결정합니다.', signal: '유형 결정 불가, 혼합 배치 규칙 충돌', output: '검사 유형 (FULL / AQL / SAMPLE)', stage: 2, dlog: 'QmsRequested.inspectionTypeClassify — 검사 유형(전수/AQL/샘플) 분류 구현 지점', handoff: '검사 유형, AQL 레벨', description: '이번 배치를 전부 볼지, 통계적 기준으로 일부만 볼지, 무작위 소량만 볼지 결정해 검사 범위를 정하는 단계입니다.' },
    { key: 'priority-set', label: '우선순위 설정', summary: '검사 긴급도와 SLA 등급에 따라 처리 우선순위를 부여합니다.', signal: 'SLA 등급 불명, 긴급 처리 누락', output: '우선순위 등급', stage: 1, dlog: 'QmsRequested.prioritySet — QMS 검사 우선순위/SLA 등급 부여 구현 지점', handoff: '우선순위 등급, 검사 마감 시각', description: '당일 출고처럼 급한 건을 먼저 검사할 수 있도록 SLA 기준으로 순서를 정하는 단계입니다.' },
    { key: 'audit-init', label: '감사 로그 초기화', summary: '이 검사 건의 이력 추적 체인을 시작하고 감사 로그를 생성합니다.', signal: '로그 생성 실패, 추적 단절', output: '감사 로그 ID', stage: 1, dlog: 'QmsRequested.auditInit — 검사 이력/감사 로그 초기화 구현 지점', handoff: '감사 로그 ID, 이벤트 체인 seed', description: '이 검사 건이 어떤 과정을 거쳤는지 나중에 확인할 수 있도록 처음부터 이력을 기록하기 시작하는 단계입니다.' },
    { key: 'next-queue', label: '샘플링 큐 등록', summary: '다음 샘플추출 stage가 처리할 이벤트를 큐에 등록합니다.', signal: '큐 적재 실패, 이벤트 유실', output: '샘플링 대기 작업', stage: 2, dlog: 'QmsRequested.nextQueue — 샘플링 큐 등록/이벤트 발행 구현 지점', handoff: '검사 정책 ID, 배치 ID, 검사 유형, 우선순위', description: '검사 요청 처리를 마치고 다음 단계인 샘플 추출 대기줄에 이 건을 올려 이어서 처리될 수 있도록 넘겨주는 단계입니다.' },
];

const QMS_SAMPLING_WORK_NODES: QmsWorkNode[] = [
    { key: 'plan-build', label: '샘플링 계획 수립', summary: '검사 정책과 배치 정보를 바탕으로 샘플링 계획을 수립합니다.', signal: '정책 파라미터 불완전, 배치 크기 불명', output: '샘플링 계획서', stage: 2, dlog: 'QmsSampling.planBuild — 샘플링 계획 수립 구현 지점', handoff: '샘플 대상 수량, 샘플링 방법, 계획 ID', description: '어떤 방식으로 몇 개를 뽑을지 검사 정책을 기준으로 샘플링 계획을 만드는 단계입니다.' },
    { key: 'aql-calc', label: 'AQL 표본 수 계산', summary: 'AQL 기준에 따라 배치 크기 대비 최소 표본 수와 합격 기준을 계산합니다.', signal: 'AQL 파라미터 불명, 배치 크기 이상', output: '표본 수 · 합격 기준 (Ac/Re)', stage: 2, dlog: 'QmsSampling.aqlCalc — AQL 표본 수/합격기준(Ac/Re) 계산 구현 지점', handoff: '표본 수, Ac(합격) 기준, Re(불합격) 기준', description: '통계적 품질 기준에 따라 전체 수량에서 몇 개를 뽑고 몇 개까지 불량이면 합격인지 계산하는 단계입니다.' },
    { key: 'sample-pick', label: '샘플 물리적 추출', summary: '계획에 따라 배치에서 실물 샘플을 무작위 추출합니다.', signal: '재고 위치 불명, 물리 접근 불가', output: '추출 샘플 목록', stage: 3, dlog: 'QmsSampling.samplePick — 실물 샘플 무작위 추출 구현 지점', handoff: '샘플 개수, 위치 목록', description: '계획한 수량대로 실제 창고에서 상품을 무작위로 골라내는 단계입니다.' },
    { key: 'sample-tag', label: '샘플 식별 태그 부착', summary: '추출한 샘플 각각에 QMS 추적용 바코드·QR 태그를 부착합니다.', signal: '태그 발급 실패, 바코드 중복', output: '태그된 샘플 목록', stage: 2, dlog: 'QmsSampling.sampleTag — 샘플 식별 태그/바코드 부착 구현 지점', handoff: '샘플 ID 목록, 태그 형식', description: '뽑은 샘플이 어느 배치의 몇 번째 샘플인지 알 수 있도록 고유 번호 태그를 붙이는 단계입니다.' },
    { key: 'sample-register', label: '샘플 등록', summary: '태그 완료된 샘플 목록을 시스템에 등록하고 검사 대상으로 확정합니다.', signal: '등록 실패, 샘플 수량 불일치', output: '검사 대기 샘플 레코드', stage: 2, dlog: 'QmsSampling.sampleRegister — 샘플 목록 시스템 등록 구현 지점', handoff: '등록된 샘플 ID 배열, 총 수량', description: '실물로 뽑은 샘플을 시스템에 공식적으로 등록해 검사 대상으로 확정하는 단계입니다.' },
    { key: 'inspector-assign', label: '검사자 배정', summary: '우선순위와 전문성을 기준으로 검사 담당자를 배정합니다.', signal: '검사자 없음, 전문 등급 부족', output: '배정된 검사자 ID', stage: 2, dlog: 'QmsSampling.inspectorAssign — 검사자 배정/전문성 매칭 구현 지점', handoff: '검사자 ID, 배정 이유', description: '이 샘플을 검사할 담당자를 지정하는 단계입니다.' },
    { key: 'tool-prepare', label: '검사 도구 준비', summary: '검사 항목에 맞는 장비·체크리스트를 준비하고 검교정 상태를 확인합니다.', signal: '장비 미준비, 검교정 만료', output: '준비 완료 도구 목록', stage: 1, dlog: 'QmsSampling.toolPrepare — 검사 장비/체크리스트 준비 및 검교정 확인 구현 지점', handoff: '도구 목록, 검교정 만료일', description: '검사 항목에 필요한 장비와 점검 목록을 준비하고 측정 장비의 검교정이 유효한지 확인하는 단계입니다.' },
    { key: 'next-queue', label: '검사 진행 큐 등록', summary: '샘플 추출이 완료된 건을 검사진행 stage 큐에 등록합니다.', signal: '큐 적재 실패, 이벤트 유실', output: '검사 진행 대기 작업', stage: 2, dlog: 'QmsSampling.nextQueue — 검사진행 큐 등록/이벤트 발행 구현 지점', handoff: '샘플 ID 배열, 검사자 ID, 도구 목록, 검사 정책 ID', description: '샘플 추출 준비를 모두 마치고 검사 진행 대기줄에 올려 검사 단계로 이어지게 넘기는 단계입니다.' },
];

const QMS_INSPECTING_WORK_NODES: QmsWorkNode[] = [
    { key: 'tool-calibrate', label: '계측 도구 영점 확인', summary: '검사 시작 전 저울·측정기 등 계측 도구의 영점과 검교정 상태를 확인합니다.', signal: '영점 오류, 검교정 만료', output: '도구 준비 완료 확인서', stage: 1, dlog: 'QmsInspecting.toolCalibrate — 계측 도구 영점/검교정 확인 구현 지점', handoff: '도구 상태, 검교정 유효 여부', description: '검사 결과의 신뢰성을 위해 계측 도구가 올바르게 세팅되어 있는지 확인하는 단계입니다.' },
    { key: 'visual-check', label: '외관 검사', summary: '샘플 외관의 파손·오염·색상·형상 이상을 육안 및 이미지로 확인합니다.', signal: '파손, 오염, 색상 불일치', output: '외관 검사 결과 (통과/불량)', stage: 2, dlog: 'QmsInspecting.visualCheck — 외관 파손/오염/색상 육안 검사 구현 지점', handoff: '외관 판정, 불량 상세', description: '상품 겉면의 긁힘, 찌그러짐, 오염, 색상 불일치 등 눈에 보이는 결함을 찾는 단계입니다.' },
    { key: 'weight-check', label: '중량 검사', summary: '샘플 중량을 실측해 기준값 및 허용 오차 범위와 대조합니다.', signal: '중량 기준값 이탈, 저울 이상', output: '중량 측정값 (g, 합격/불합격)', stage: 2, dlog: 'QmsInspecting.weightCheck — 중량 실측/기준값 대조 구현 지점', handoff: '측정 중량, 편차, 합격 여부', description: '상품을 저울에 올려 실제 무게를 재고 기준 중량과 허용 오차 범위 안에 드는지 확인하는 단계입니다.' },
    { key: 'label-check', label: '라벨 검사', summary: '운송장·바코드·내용물 라벨이 주문 정보와 일치하는지 확인합니다.', signal: '바코드 불일치, 내용물-라벨 오표기', output: '라벨 검사 결과 (통과/불량)', stage: 2, dlog: 'QmsInspecting.labelCheck — 운송장/바코드/내용물 라벨 일치 검사 구현 지점', handoff: '라벨 판정, 불일치 항목', description: '상자에 붙은 운송장 바코드, 상품 바코드, 내용물 표기가 실제 주문 내용과 맞는지 확인하는 단계입니다.' },
    { key: 'function-test', label: '기능 검사', summary: '제품 유형에 따라 전원·동작·핵심 스펙을 확인합니다. (전자제품·기계류 해당, 일반 상품은 N/A)', signal: '동작 불량, 스펙 미달', output: '기능 검사 결과 (통과/불량/N/A)', stage: 3, dlog: 'QmsInspecting.functionTest — 제품 기능/동작/핵심 스펙 검사 구현 지점', handoff: '기능 판정, 스펙 편차', description: '작동 여부 확인이 필요한 제품에 대해 전원 켜짐, 버튼 동작, 핵심 성능 스펙을 점검하는 단계입니다.' },
    { key: 'package-integrity', label: '포장 무결성 검사', summary: '내부 포장재·완충재·밀봉 상태가 배송 충격에 견딜 수 있는지 확인합니다.', signal: '밀봉 불량, 완충재 누락, 박스 강도 미달', output: '포장 검사 결과 (통과/불량)', stage: 2, dlog: 'QmsInspecting.packageIntegrity — 포장재/완충재/밀봉 상태 검사 구현 지점', handoff: '포장 판정, 불량 부위', description: '배송 중 충격에 대비해 내부 포장재, 완충재, 테이프 밀봉 상태를 확인하는 단계입니다.' },
    { key: 'evidence-capture', label: '검사 증빙 수집', summary: '검사 항목별 사진·측정값·체크리스트를 수집해 감사 기록에 첨부합니다.', signal: '사진 업로드 실패, 측정값 누락', output: '증빙 파일 목록 (이미지·수치)', stage: 2, dlog: 'QmsInspecting.evidenceCapture — 검사 사진/측정값/체크리스트 수집 구현 지점', handoff: '증빙 파일 ID 목록, 검사자 서명', description: '검사 과정을 객관적으로 남기기 위해 사진과 측정값을 기록하고 보관하는 단계입니다.' },
    { key: 'result-record', label: '검사 결과 기록', summary: '모든 검사 항목 결과를 종합해 판정 단계로 인계할 검사 레코드를 생성합니다.', signal: '레코드 생성 실패, 미완료 항목 잔존', output: '검사 완료 레코드', stage: 2, dlog: 'QmsInspecting.resultRecord — 검사 결과 종합/판정 인계 레코드 생성 구현 지점', handoff: '항목별 판정 배열, 불량 수, 증빙 ID, 검사자 ID', description: '모든 검사 항목의 결과를 하나로 모아 판정 단계로 넘길 공식 검사 레코드를 만드는 단계입니다.' },
];

const QMS_JUDGED_WORK_NODES: QmsWorkNode[] = [
    { key: 'criteria-load', label: '합격 기준 로드', summary: '화주·품목별 합격 기준(AQL Ac/Re, 불량 유형별 임계치)을 로드합니다.', signal: '기준 미등록, 버전 불일치', output: '합격 기준 세트', stage: 2, dlog: 'QmsJudged.criteriaLoad — 화주/품목별 합격 기준 로드 구현 지점', handoff: '기준 세트, 기준 버전', description: '이 검사 건에 어떤 합격 기준을 적용할지 기준값을 불러오는 단계입니다.' },
    { key: 'criteria-apply', label: '기준 적용 비교', summary: '검사 결과 레코드와 합격 기준을 항목별로 대조합니다.', signal: '데이터 불완전, 항목 누락', output: '항목별 대조 결과', stage: 2, dlog: 'QmsJudged.criteriaApply — 검사 결과/합격 기준 항목별 대조 구현 지점', handoff: '항목별 통과/불합격 배열, 불량 수', description: '검사 단계의 각 항목 결과를 합격 기준과 비교해 기준 이탈 항목을 확인하는 단계입니다.' },
    { key: 'defect-classify', label: '결함 분류', summary: '불합격 항목을 치명(Critical)·중대(Major)·경미(Minor) 3등급으로 분류합니다.', signal: '등급 기준 불명, 복합 결함 분류 충돌', output: '결함 등급 목록', stage: 2, dlog: 'QmsJudged.defectClassify — 결함 치명/중대/경미 3등급 분류 구현 지점', handoff: '결함 등급 목록, 최고 등급', description: '기준을 벗어난 항목이 얼마나 심각한지 등급을 매기는 단계입니다.' },
    { key: 'judgment-decide', label: '최종 판정 결정', summary: '결함 등급·수량을 종합해 Pass / Fail / Hold 중 하나로 최종 판정합니다.', signal: '판정 규칙 충돌, 경계 사례 처리 불명', output: '최종 판정 (Pass / Fail / Hold)', stage: 3, dlog: 'QmsJudged.judgmentDecide — Pass/Fail/Hold 최종 판정 결정 구현 지점', handoff: '판정 결과, 판정 사유', description: '결함 분류 결과를 종합해 출고 가능, 출고 불가, 추가 검토 중 하나로 결정하는 단계입니다.' },
    { key: 'hold-route', label: 'Hold 격리 라우팅', summary: 'Hold 판정 시 배치를 격리 구역으로 라우팅하고 재검사 지시를 내립니다.', signal: '격리 구역 만석, 라우팅 실패', output: '격리 지시서', stage: 2, dlog: 'QmsJudged.holdRoute — Hold 판정 격리 구역 라우팅/재검사 지시 구현 지점', handoff: '격리 위치, 재검사 지시, 사유', description: '판정이 보류된 상품을 격리 구역으로 옮기고 재검사 또는 추가 확인 지시를 내리는 단계입니다.' },
    { key: 'fail-route', label: 'Fail 반품·폐기 라우팅', summary: 'Fail 판정 시 반품/폐기 경로를 결정하고 OMS 취소 이벤트를 발행합니다.', signal: '반품 정책 불명, OMS 이벤트 발행 실패', output: '반품/폐기 지시서', stage: 3, dlog: 'QmsJudged.failRoute — Fail 판정 반품/폐기 경로 결정/OMS 취소 이벤트 발행 구현 지점', handoff: '처리 경로, OMS 취소 이벤트', description: '불합격 판정 시 공급사 반품 또는 폐기 경로를 결정하고 OMS에 주문 취소 또는 재처리 이벤트를 보내는 단계입니다.' },
    { key: 'judgment-publish', label: '판정 결과 게시', summary: '최종 판정을 이벤트로 발행하고 관련 시스템에 알림을 전달합니다.', signal: '이벤트 발행 실패, 알림 전달 오류', output: '판정 이벤트', stage: 2, dlog: 'QmsJudged.judgmentPublish — 판정 결과 이벤트 발행/알림 구현 지점', handoff: '판정 이벤트, 알림 수신 시스템 목록', description: '판정 결과를 공식 이벤트로 만들어 다음 단계와 모니터링 시스템에 전달하는 단계입니다.' },
    { key: 'audit-log', label: '판정 감사 로그 저장', summary: '판정 과정 전체(기준·비교·결함·판정·담당자)를 감사 로그에 기록합니다.', signal: '로그 저장 실패, 필드 누락', output: '판정 감사 레코드', stage: 1, dlog: 'QmsJudged.auditLog — 판정 전 과정 감사 로그 저장 구현 지점', handoff: '감사 레코드 ID', description: '판정 기준, 결함, 최종 판정자를 나중에 확인할 수 있도록 기록으로 남기는 단계입니다.' },
];

const QMS_RELEASED_WORK_NODES: QmsWorkNode[] = [
    { key: 'release-doc-build', label: '출고 승인서 구성', summary: '판정 통과된 배치의 출고 승인서를 구성합니다.', signal: '판정 정보 불완전, 문서 템플릿 오류', output: '출고 승인서 초안', stage: 2, dlog: 'QmsReleased.releaseDocBuild — 출고 승인서 구성 구현 지점', handoff: '승인서 초안, 승인 번호', description: '품질 검사를 통과한 배치가 출고될 수 있다는 공식 승인서를 만드는 단계입니다.' },
    { key: 'cert-attach', label: '품질 인증서 첨부', summary: '검사 증빙과 합격 기준 통과 내역을 품질 인증서로 승인서에 첨부합니다.', signal: '증빙 파일 누락, 인증서 생성 실패', output: '품질 인증서 첨부 완료', stage: 1, dlog: 'QmsReleased.certAttach — 품질 인증서 첨부/증빙 연결 구현 지점', handoff: '인증서 ID, 증빙 파일 참조', description: '검사 사진, 측정값, 합격 판정 내역 등을 공식 품질 인증서로 정리해 출고 승인서에 붙이는 단계입니다.' },
    { key: 'traceability-link', label: '추적성 정보 연결', summary: '배치 ID·검사 ID·샘플 ID를 연결해 출고 후 이력 추적이 가능하게 합니다.', signal: 'ID 연결 실패, 체인 단절', output: '추적성 링크 완료', stage: 2, dlog: 'QmsReleased.traceabilityLink — 배치/검사/샘플 ID 추적성 연결 구현 지점', handoff: '추적 체인 ID 맵', description: '출고 후에도 어느 검사를 거쳤고 어떤 샘플을 뽑았는지 역추적할 수 있도록 ID들을 연결하는 단계입니다.' },
    { key: 'event-envelope', label: '이벤트 봉투 구성', summary: 'TMS 인계에 필요한 라우팅 키·traceId·메타를 포함한 이벤트 봉투를 구성합니다.', signal: '라우팅 키 누락, 메타 불완전', output: '이벤트 봉투', stage: 2, dlog: 'QmsReleased.eventEnvelope — TMS 인계용 이벤트 봉투 구성 구현 지점', handoff: 'routingKey(quality.released), traceId, 봉투 payload', description: 'TMS가 받을 수 있는 형식으로 라우팅 키와 추적 정보를 담아 메시지를 구성하는 단계입니다.' },
    { key: 'tms-handoff', label: 'TMS 배차 요청 인계', summary: '출고 승인 이벤트를 발행해 TMS 배차 요청을 시작합니다.', signal: '이벤트 발행 실패, TMS 수신 거부', output: 'TMS 배차 요청 이벤트', stage: 3, dlog: 'QmsReleased.tmsHandoff — TMS 배차 요청 이벤트 발행 구현 지점', handoff: '배차 요청 이벤트, 출고 승인 번호', description: '품질 게이트를 통과했다는 신호를 TMS에 전달해 배송 차량 배차가 시작되도록 하는 단계입니다.' },
    { key: 'handoff-watch', label: 'TMS 수신 확인', summary: 'TMS가 배차 요청 이벤트를 정상 수신했는지 ACK를 확인합니다.', signal: 'ACK 미수신, 타임아웃', output: 'TMS 수신 확인 완료', stage: 2, dlog: 'QmsReleased.handoffWatch — TMS ACK 수신 확인/타임아웃 처리 구현 지점', handoff: 'ACK 상태, 수신 시각', description: 'TMS가 배차 요청을 잘 받았는지 확인하고 응답이 없으면 재시도 또는 알림을 발생시키는 단계입니다.' },
    { key: 'close-quality', label: 'QMS 종료 이벤트 발행', summary: '이 건의 QMS 처리가 완료됐음을 알리는 종료 이벤트를 발행하고 상태를 마감합니다.', signal: '종료 이벤트 발행 실패, 잔여 열린 상태 존재', output: 'QMS 종료 이벤트', stage: 1, dlog: 'QmsReleased.closeQuality — QMS 처리 종료 이벤트 발행/상태 마감 구현 지점', handoff: '종료 이벤트, 총 소요 시각', description: 'QMS가 담당했던 품질 검사 업무를 공식적으로 마감하고 완료 이벤트를 발행하는 단계입니다.' },
];

export const QMS_STAGE_WORK_NODES: Record<QmsStage, QmsWorkNode[]> = {
    QMS_REQUESTED: QMS_REQUESTED_WORK_NODES,
    QMS_SAMPLING: QMS_SAMPLING_WORK_NODES,
    QMS_INSPECTING: QMS_INSPECTING_WORK_NODES,
    QMS_JUDGED: QMS_JUDGED_WORK_NODES,
    QMS_RELEASED: QMS_RELEASED_WORK_NODES,
};

export function getInitialQmsStageWorkNodeKey(stage: QmsStage): QmsWorkNodeKey {
    return QMS_STAGE_WORK_NODES[stage][0].key as QmsWorkNodeKey;
}

export function getNextQmsStageWorkNodeKey(stage: QmsStage, key?: QmsWorkNodeKey): QmsWorkNodeKey | null {
    const nodes = QMS_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (nodes[safeIndex + 1]?.key as QmsWorkNodeKey | undefined) ?? null;
}

export function getQmsStageWorkNodeLabel(stage: QmsStage, key?: QmsWorkNodeKey): string {
    const nodes = QMS_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

// =============================================================
// EOS (자동발주) — Buyer-side 재고 보충. 끝 단계에서 INBOUND_RECEIVED로 핸드오프.
// 본 노드 정의는 shape stub. 상세 정책/실 데이터는 stage=2 회수 (chs.dlog 자리).
// =============================================================

export type EosWorkNode = {
    key: string;
    label: string;
    summary: string;
    signal: string;
    output: string;
    stage: number;
    dlog: string;
    handoff: string;
    description?: string;
};

const EOS_FORECASTED_WORK_NODES: EosWorkNode[] = [
    { key: 'demand-collect', label: '수요 데이터 수집', summary: '과거 출고·재고 회전 데이터를 수집해 예측 입력값을 구성합니다.', signal: '데이터 누락, 수집 실패', output: '수요 입력 데이터셋', stage: 2, dlog: 'EosForecasted.demandCollect — 수요 데이터 수집 구현 지점', handoff: '품목별 시계열 데이터', description: '품목별 과거 판매·소진 패턴을 모아 자동발주 판단의 기초 자료를 구성하는 단계입니다.' },
    { key: 'forecast-calc', label: '수요예측 계산', summary: '수집 데이터를 모델에 입력해 향후 수요량을 추정합니다.', signal: '모델 오류, 신뢰도 부족', output: '예측 수요량', stage: 2, dlog: 'EosForecasted.forecastCalc — 수요예측 모델 계산 구현 지점', handoff: '품목별 예측 수요량 + 신뢰구간', description: '예측 모델로 다음 기간의 필요 수량을 계산하는 단계입니다.' },
    { key: 'forecast-publish', label: '예측 결과 발행', summary: '예측 결과를 발주점 평가 단계로 인계할 이벤트로 발행합니다.', signal: '이벤트 발행 실패', output: '수요예측 이벤트', stage: 2, dlog: 'EosForecasted.forecastPublish — 예측 결과 발행 구현 지점', handoff: '예측 수요량, traceId', description: '예측 결과를 다음 단계가 받을 수 있도록 이벤트로 발행하는 단계입니다.' },
];

const EOS_REORDER_TRIGGERED_WORK_NODES: EosWorkNode[] = [
    { key: 'stock-check', label: '재고 현황 조회', summary: '품목별 실재고/가용재고 현재값을 조회합니다.', signal: '재고 조회 실패, 데이터 불일치', output: '품목별 재고 수량', stage: 2, dlog: 'EosReorderTriggered.stockCheck — 재고 조회 구현 지점', handoff: '품목별 on_hand/available', description: '예측치와 비교할 현재 재고 상태를 확인하는 단계입니다.' },
    { key: 'reorder-evaluate', label: '발주점 평가', summary: '현재 재고가 발주점(ROP) 이하인지 평가합니다.', signal: 'ROP 미등록, 임계값 충돌', output: '발주 필요 품목 목록', stage: 2, dlog: 'EosReorderTriggered.reorderEvaluate — 발주점 임계 평가 구현 지점', handoff: '발주 대상 품목·수량', description: '재고가 자동발주 임계 아래로 떨어진 품목을 식별하는 단계입니다.' },
    { key: 'reorder-trigger', label: '발주 트리거 발행', summary: '발주가 필요한 품목에 대해 발주 트리거 이벤트를 발행합니다.', signal: '이벤트 발행 실패', output: '발주 트리거 이벤트', stage: 2, dlog: 'EosReorderTriggered.reorderTrigger — 발주 트리거 이벤트 발행 구현 지점', handoff: '발주 대상 품목, 권장 수량', description: '공급사 선정 단계가 받을 발주 트리거를 발행하는 단계입니다.' },
];

const EOS_SUPPLIER_SELECTED_WORK_NODES: EosWorkNode[] = [
    { key: 'supplier-lookup', label: '공급사 후보 조회', summary: '발주 대상 품목을 공급 가능한 공급사 후보 목록을 조회합니다.', signal: '공급사 없음, 계약 만료', output: '공급사 후보 목록', stage: 2, dlog: 'EosSupplierSelected.supplierLookup — 공급사 후보 조회 구현 지점', handoff: '공급사 ID 목록', description: '이 품목을 납품 가능한 공급사 후보를 찾는 단계입니다.' },
    { key: 'supplier-score', label: '공급사 점수 평가', summary: '단가·납기·품질 이력으로 공급사 점수를 계산합니다.', signal: '평가 데이터 누락', output: '공급사별 점수', stage: 2, dlog: 'EosSupplierSelected.supplierScore — 공급사 평가 점수 계산 구현 지점', handoff: '공급사 점수 맵', description: '여러 공급사 중 어디가 가장 유리한지 점수로 평가하는 단계입니다.' },
    { key: 'supplier-decide', label: '공급사 최종 선정', summary: '최고 점수 공급사를 선정하고 발주서 작성 단계로 인계합니다.', signal: '동점·결정 불가', output: '선정 공급사 ID', stage: 2, dlog: 'EosSupplierSelected.supplierDecide — 공급사 최종 선정 구현 지점', handoff: '선정 공급사 ID, 선정 사유', description: '최종 공급사를 결정하고 다음 단계로 넘기는 단계입니다.' },
];

const EOS_PO_ISSUED_WORK_NODES: EosWorkNode[] = [
    { key: 'po-build', label: '발주서 구성', summary: '품목·수량·단가·납기 등 발주서 항목을 구성합니다.', signal: '필수 항목 누락', output: '발주서 초안', stage: 2, dlog: 'EosPoIssued.poBuild — 발주서 구성 구현 지점', handoff: '발주서 초안 ID', description: '공급사에 보낼 발주서 내용을 채우는 단계입니다.' },
    { key: 'po-approve', label: '발주 승인', summary: '내부 승인 정책에 따라 발주서를 승인합니다.', signal: '승인권자 부재, 한도 초과', output: '승인된 발주서', stage: 2, dlog: 'EosPoIssued.poApprove — 발주 승인 정책 적용 구현 지점', handoff: '승인자 ID, 승인 시각', description: '발주 한도와 정책에 따라 내부 승인을 받는 단계입니다.' },
    { key: 'po-issue', label: '발주번호 부여', summary: '승인된 발주서에 정식 발주번호를 부여하고 영속화합니다.', signal: '번호 중복, 영속 실패', output: '발주서 (PO 번호 포함)', stage: 2, dlog: 'EosPoIssued.poIssue — 발주번호 부여 및 영속화 구현 지점', handoff: 'poNumber, 발주서 payload', description: '공식 발주번호를 매기고 시스템에 저장하는 단계입니다.' },
];

const EOS_PO_DISPATCHED_WORK_NODES: EosWorkNode[] = [
    { key: 'channel-prepare', label: '송신 채널 준비', summary: '공급사별 EDI·이메일·API 채널 중 송신 채널을 결정해 준비합니다.', signal: '채널 미등록, 인증 실패', output: '송신 채널 핸들', stage: 2, dlog: 'EosPoDispatched.channelPrepare — 송신 채널 준비 구현 지점', handoff: '채널 타입, 인증 핸들', description: '공급사에 발주서를 보낼 채널을 준비하는 단계입니다.' },
    { key: 'po-send', label: '발주서 송신', summary: '준비된 채널로 발주서를 공급사에 전송합니다.', signal: '송신 실패, 타임아웃', output: '송신 결과', stage: 4, dlog: 'EosPoDispatched.poSend — 공급사 외부 채널 송신 (stage=4 외부 연동)', handoff: '송신 시각, 채널 응답', description: '발주서를 공급사에 실제로 전송하는 단계입니다.' },
    { key: 'send-ack', label: '송신 ACK 수신', summary: '공급사 채널이 수신했음을 알리는 ACK를 확인합니다.', signal: 'ACK 미수신, 타임아웃', output: 'ACK 확인', stage: 2, dlog: 'EosPoDispatched.sendAck — 송신 ACK 확인 구현 지점', handoff: 'ACK 상태, 수신 시각', description: '공급사가 발주서를 잘 받았는지 응답을 확인하는 단계입니다.' },
];

const EOS_PO_CONFIRMED_WORK_NODES: EosWorkNode[] = [
    { key: 'confirm-wait', label: '공급사 수신확인 대기', summary: '공급사가 발주를 검토·수용한 수신확인을 대기합니다.', signal: '응답 지연, 거부', output: '수신확인 수신', stage: 4, dlog: 'EosPoConfirmed.confirmWait — 공급사 수신확인 대기 (stage=4 외부 응답)', handoff: '확인 응답', description: '공급사가 발주를 수락했다는 응답을 기다리는 단계입니다.' },
    { key: 'confirm-record', label: '수신확인 기록', summary: '공급사 수신확인을 시스템에 기록하고 입고 예정으로 분류합니다.', signal: '기록 실패', output: '수신확인 레코드', stage: 2, dlog: 'EosPoConfirmed.confirmRecord — 수신확인 기록 구현 지점', handoff: '확인 ID, 입고 예정일', description: '공급사 수신확인을 시스템에 정식 기록하는 단계입니다.' },
    { key: 'handoff-inbound', label: 'WMS 입고 핸드오프', summary: 'task를 INBOUND_RECEIVED로 전이시켜 WMS 입고 흐름으로 인계합니다.', signal: '전이 실패', output: 'INBOUND task 전이 완료', stage: 2, dlog: 'EosPoConfirmed.handoffInbound — EOS→WMS-IN 핸드오프 구현 지점', handoff: 'taskId, nextStage=INBOUND_RECEIVED', description: 'EOS 끝 단계에서 같은 task를 입고 흐름으로 넘기는 핸드오프 단계입니다.' },
];

export const EOS_STAGE_WORK_NODES: Record<EosStage, EosWorkNode[]> = {
    EOS_FORECASTED:         EOS_FORECASTED_WORK_NODES,
    EOS_REORDER_TRIGGERED:  EOS_REORDER_TRIGGERED_WORK_NODES,
    EOS_SUPPLIER_SELECTED:  EOS_SUPPLIER_SELECTED_WORK_NODES,
    EOS_PO_ISSUED:          EOS_PO_ISSUED_WORK_NODES,
    EOS_PO_DISPATCHED:      EOS_PO_DISPATCHED_WORK_NODES,
    EOS_PO_CONFIRMED:       EOS_PO_CONFIRMED_WORK_NODES,
};

export function getInitialEosStageWorkNodeKey(stage: EosStage): EosWorkNodeKey {
    return EOS_STAGE_WORK_NODES[stage][0].key as EosWorkNodeKey;
}

export function getNextEosStageWorkNodeKey(stage: EosStage, key?: EosWorkNodeKey): EosWorkNodeKey | null {
    const nodes = EOS_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (nodes[safeIndex + 1]?.key as EosWorkNodeKey | undefined) ?? null;
}

export function getEosStageWorkNodeLabel(stage: EosStage, key?: EosWorkNodeKey): string {
    const nodes = EOS_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

export type TmsWorkNode = {
    key: string;
    label: string;
    summary: string;
    signal: string;
    output: string;
    stage: number;
    dlog: string;
    handoff: string;
    description?: string;
};

const TMS_REQUESTED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'dispatch-ingest',
        label: '배차 요청 접수',
        summary: 'WMS 출하 완료 이벤트를 수신해 배차 요청 작업을 생성합니다.',
        signal: '이벤트 유실, 중복 요청',
        output: '배차 요청 작업',
        stage: 2,
        dlog: 'TmsRequested.dispatchIngest — 배차 요청 이벤트 수신/중복 방지 구현 지점',
        handoff: 'dispatch 요청 ID, 출하 참조 ID',
        description: '창고에서 "포장 완료, 트럭 보내줘"라는 신호를 받아 운송 시스템에 배차 작업을 만드는 단계입니다.',
    },
    {
        key: 'route-calc',
        label: '경로 계산',
        summary: '출발지와 도착지를 기반으로 최적 운송 경로를 산출합니다.',
        signal: '경로 데이터 없음, 도착지 불가',
        output: '추천 경로',
        stage: 3,
        dlog: 'TmsRequested.routeCalc — 경로 최적화/거리 비용 계산 구현 지점',
        handoff: '경로 코드, 예상 거리, 예상 시간',
        description: '창고에서 고객 집까지 가장 빠르고 효율적인 길을 계산하는 단계입니다. 내비게이션이 최적 경로를 찾는 것과 같습니다.',
    },
    {
        key: 'vehicle-match',
        label: '차량 가용성 확인',
        summary: '경로와 화물에 맞는 가용 차량을 조회합니다.',
        signal: '가용 차량 없음, 차량 용량 초과',
        output: '차량 후보 목록',
        stage: 2,
        dlog: 'TmsRequested.vehicleMatch — 차량 가용성/차량 풀 조회 구현 지점',
        handoff: '차량 후보 ID 목록',
        description: '이 화물 크기와 경로에 맞는 차량이 현재 사용 가능한지 확인해 후보 차량 목록을 뽑는 단계입니다.',
    },
    {
        key: 'dispatch-queue',
        label: '배차 대기 등록',
        summary: '배차 확정을 기다리는 대기 큐에 요청을 등록합니다.',
        signal: '큐 적재 실패',
        output: '배차 대기 이벤트',
        stage: 2,
        dlog: 'TmsRequested.dispatchQueue — 배차 대기 큐 등록/이벤트 발행 구현 지점',
        handoff: '배차 대기 이벤트',
        description: '차량이 확정될 때까지 이 배차 요청을 대기줄에 올려놓는 단계입니다. 식당에서 자리가 날 때까지 대기 명단에 이름을 올리는 것과 같습니다.',
    },
];

const TMS_VEHICLE_ASSIGNED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'vehicle-confirm',
        label: '차량 확정',
        summary: '차량 후보 중 하나를 최종 배정 차량으로 확정합니다.',
        signal: '배차 경합, 차량 이미 배정',
        output: '확정 차량 ID',
        stage: 2,
        dlog: 'TmsVehicleAssigned.vehicleConfirm — 차량 최종 확정/경합 처리 구현 지점',
        handoff: '차량 ID, 차량 유형',
        description: '후보 차량 중 이 배송에 실제로 투입할 차량 하나를 최종 결정하는 단계입니다.',
    },
    {
        key: 'driver-assign',
        label: '기사 배정',
        summary: '배정 차량에 운전 기사를 연결합니다.',
        signal: '기사 미등록, 기사 부재',
        output: '기사 ID',
        stage: 2,
        dlog: 'TmsVehicleAssigned.driverAssign — 기사 배정/가용성 확인 구현 지점',
        handoff: '기사 ID, 연락처',
        description: '확정된 차량에 오늘 이 배송을 맡을 기사를 연결하는 단계입니다. 택시 앱에서 주변 기사가 배정되는 것과 비슷합니다.',
    },
    {
        key: 'departure-notify',
        label: '출발 준비 통보',
        summary: '기사와 화주에게 출발 일정과 상차 위치를 통보합니다.',
        signal: '통보 실패',
        output: '통보 이벤트',
        stage: 2,
        dlog: 'TmsVehicleAssigned.departureNotify — 출발 준비 통보/알림 발행 구현 지점',
        handoff: '통보 수신 확인',
        description: '배정된 기사에게 "언제, 창고 어디서 화물 실으면 돼요"를 알려주는 단계입니다.',
    },
];

const TMS_LOADED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'cargo-scan',
        label: '화물 스캔·확인',
        summary: '상차 전 화물 바코드를 스캔해 출하 정보와 일치 여부를 확인합니다.',
        signal: '스캔 불일치, 화물 누락',
        output: '화물 확인 결과',
        stage: 2,
        dlog: 'TmsLoaded.cargoScan — 화물 스캔/출하 정보 대조 구현 지점',
        handoff: '스캔 결과, 박스 ID 목록',
        description: '트럭에 싣기 전 박스 바코드를 스캐너로 찍어, 내보낼 화물이 맞는지 하나씩 대조 확인하는 단계입니다.',
    },
    {
        key: 'load-confirm',
        label: '상차 완료 확인',
        summary: '모든 화물이 차량에 적재됐음을 기사가 확인하고 서명합니다.',
        signal: '서명 누락, 부분 상차',
        output: '상차 완료 이벤트',
        stage: 2,
        dlog: 'TmsLoaded.loadConfirm — 상차 완료 확인/서명 처리 구현 지점',
        handoff: '적재 완료 상태, 기사 서명',
        description: '모든 화물을 트럭에 다 실었는지 기사가 최종 확인하고 서명하는 단계입니다.',
    },
    {
        key: 'departure-signal',
        label: '출발 신호',
        summary: '상차 완료 후 출발을 시스템에 등록하고 운송 추적을 시작합니다.',
        signal: '출발 신호 미수신',
        output: '출발 이벤트',
        stage: 2,
        dlog: 'TmsLoaded.departureSignal — 출발 신호/Track&Trace 시작 구현 지점',
        handoff: '출발 시각, 추적 세션 ID',
        description: '트럭이 창고를 떠나는 시각을 시스템에 기록하고, 이후 배송 위치 추적을 시작하는 단계입니다.',
    },
];

const TMS_DELIVERING_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'en-route',
        label: '운송 중',
        summary: '차량이 도착지를 향해 이동 중인 구간입니다.',
        signal: '경로 이탈, 장시간 미응답',
        output: '위치 이벤트',
        stage: 3,
        dlog: 'TmsDelivering.enRoute — 운송 중 위치 이벤트/경로 이탈 감지 구현 지점',
        handoff: '현재 위치, 예상 도착',
        description: '트럭이 배송지를 향해 달리는 구간입니다. GPS로 현재 위치를 주기적으로 기록합니다.',
    },
    {
        key: 'checkpoint',
        label: '중간 체크포인트',
        summary: '중간 경유지 또는 구간 분기에서 위치를 확인합니다.',
        signal: '체크포인트 미통과',
        output: '체크포인트 이벤트',
        stage: 3,
        dlog: 'TmsDelivering.checkpoint — 체크포인트 확인/지연 감지 구현 지점',
        handoff: '체크포인트 ID, 통과 시각',
        description: '미리 정해둔 중간 지점(물류허브 등)을 제 시간에 통과하는지 확인해 지연 여부를 파악하는 단계입니다.',
    },
    {
        key: 'arrival-estimate',
        label: '도착 예정 확인',
        summary: '도착지 인근에서 예상 도착 시각을 확인하고 수취인에게 통보합니다.',
        signal: '수취인 미통보, 도착 지연',
        output: '도착 예정 통보',
        stage: 2,
        dlog: 'TmsDelivering.arrivalEstimate — ETA 계산/수취인 사전 통보 구현 지점',
        handoff: 'ETA, 수취인 통보 상태',
        description: '트럭이 목적지 근처에 오면 "몇 시쯤 도착해요"를 계산해 받는 사람에게 미리 알려주는 단계입니다.',
    },
];

const TMS_DELIVERED_WORK_NODES: TmsWorkNode[] = [
    {
        key: 'delivery-confirm',
        label: '인도 확인',
        summary: '수취인이 화물을 직접 수령했음을 확인합니다.',
        signal: '수취인 부재, 수령 거부',
        output: '인도 확인 이벤트',
        stage: 2,
        dlog: 'TmsDelivered.deliveryConfirm — 인도 확인/수령 실패 처리 구현 지점',
        handoff: '수령 확인 상태, 수취인 ID',
        description: '받는 사람이 실제로 물건을 받았는지 확인하는 단계입니다. 집에 아무도 없으면 부재중 처리로 분기합니다.',
    },
    {
        key: 'proof-capture',
        label: '서명·증빙 수집',
        summary: '전자 서명 또는 사진 증빙을 수집해 인도 완료 증거로 보관합니다.',
        signal: '증빙 수집 실패',
        output: '증빙 파일',
        stage: 3,
        dlog: 'TmsDelivered.proofCapture — 전자서명/사진 증빙 수집 구현 지점',
        handoff: '증빙 파일 ID',
        description: '받는 사람의 서명이나 문 앞 사진을 찍어 "이 시각에 정확히 배달했음"을 증명하는 자료로 보관하는 단계입니다.',
    },
    {
        key: 'close-order',
        label: '주문 종료',
        summary: '인도 완료 이벤트를 발행하고 전체 주문 흐름을 닫습니다.',
        signal: '종료 이벤트 발행 실패',
        output: 'dispatch.delivered 이벤트',
        stage: 2,
        dlog: 'TmsDelivered.closeOrder — 인도 완료 이벤트 발행/주문 종료 구현 지점',
        handoff: '종료 이벤트, 전체 주문 완료 상태',
        description: '"배송 완료"를 시스템에 기록해 주문-창고-배송으로 이어진 전체 흐름을 마무리하는 단계입니다.',
    },
];

export const TMS_STAGE_WORK_NODES: Record<TmsStage, TmsWorkNode[]> = {
    TMS_REQUESTED: TMS_REQUESTED_WORK_NODES,
    TMS_VEHICLE_ASSIGNED: TMS_VEHICLE_ASSIGNED_WORK_NODES,
    TMS_LOADED: TMS_LOADED_WORK_NODES,
    TMS_DELIVERING: TMS_DELIVERING_WORK_NODES,
    TMS_DELIVERED: TMS_DELIVERED_WORK_NODES,
};

export function getInitialOmsReceiveNodeKey(): OmsReceiveNodeKey {
    return OMS_RECEIVE_WORK_NODES[0].key as OmsReceiveNodeKey;
}

export function getInitialOmsStageWorkNodeKey(stage: OmsStage): OmsReceiveNodeKey {
    return OMS_STAGE_WORK_NODES[stage][0].key as OmsReceiveNodeKey;
}

export function getNextOmsReceiveNodeKey(key?: OmsReceiveNodeKey): OmsReceiveNodeKey | null {
    const currentIndex = OMS_RECEIVE_WORK_NODES.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (OMS_RECEIVE_WORK_NODES[safeIndex + 1]?.key as OmsReceiveNodeKey | undefined) ?? null;
}

export function getNextOmsStageWorkNodeKey(stage: OmsStage, key?: OmsReceiveNodeKey): OmsReceiveNodeKey | null {
    const nodes = OMS_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (nodes[safeIndex + 1]?.key as OmsReceiveNodeKey | undefined) ?? null;
}

export function getOmsReceiveNodeLabel(key?: OmsReceiveNodeKey): string {
    return OMS_RECEIVE_WORK_NODES.find(node => node.key === key)?.label ?? OMS_RECEIVE_WORK_NODES[0].label;
}

export function getOmsStageWorkNodeLabel(stage: OmsStage, key?: OmsReceiveNodeKey): string {
    const nodes = OMS_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

export function getInitialTmsStageWorkNodeKey(stage: TmsStage): TmsWorkNodeKey {
    return TMS_STAGE_WORK_NODES[stage][0].key as TmsWorkNodeKey;
}

export function getNextTmsStageWorkNodeKey(stage: TmsStage, key?: TmsWorkNodeKey): TmsWorkNodeKey | null {
    const nodes = TMS_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (nodes[safeIndex + 1]?.key as TmsWorkNodeKey | undefined) ?? null;
}

export function getTmsStageWorkNodeLabel(stage: TmsStage, key?: TmsWorkNodeKey): string {
    const nodes = TMS_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

export type WmsWorkNode = {
    key: string;
    label: string;
    description?: string;
};

export const WMS_STAGE_WORK_NODES: Record<WmsOutStage, WmsWorkNode[]> = {
    WMS_RECEIVED: [
        { key: 'request-ingest', label: '출고 요청 수신', description: 'OMS(주문 시스템)에서 보낸 "이 상품을 내보내 주세요" 요청을 창고가 받아 적는 단계입니다.' },
        { key: 'duplicate-check', label: '중복 요청 검사', description: '같은 주문이 두 번 들어와 똑같은 상품을 두 번 내보내지 않도록, 이미 처리된 요청인지 확인하는 단계입니다.' },
        { key: 'work-key', label: '작업번호 발급', description: '창고 안에서 이 출고 건을 추적할 수 있도록 고유 번호(작업번호)를 만들어 붙이는 단계입니다.' },
    ],
    WMS_ALLOCATED: [
        { key: 'stock-check', label: '가용 재고 조회', description: '창고 안에 실제로 보낼 수 있는 재고가 충분히 있는지 숫자를 세어 확인하는 단계입니다.' },
        { key: 'rule-apply', label: 'Zone/Lot 규칙', description: '같은 상품이라도 어느 구역(Zone)·어느 묶음(Lot)에서 꺼낼지 정하는 규칙을 적용합니다. (예: 유통기한이 빠른 것부터)' },
        { key: 'stock-reserve', label: '재고 예약', description: '꺼내기로 정한 재고에 "이건 이 주문 거예요" 표시를 걸어, 다른 주문이 가져가지 못하게 잠가두는 단계입니다.' },
        { key: 'shortage-check', label: '부족 판정', description: '예약하려 했더니 재고가 모자란 경우를 잡아내, 부족 처리(결품)로 분기시키는 단계입니다.' },
    ],
    WMS_PICKING: [
        { key: 'pick-order', label: '피킹 지시 생성', description: '"몇 번 선반에서 무엇을 몇 개 꺼내라"라는 작업 지시서를 만들어 작업자에게 내려보내는 단계입니다.' },
        { key: 'worker-assign', label: '작업자 배정', description: '그 지시서를 누가 처리할지 창고 작업자를 정해 일감을 나눠주는 단계입니다.' },
        { key: 'location-move', label: '위치 이동', description: '배정된 작업자가 상품이 놓인 선반 위치까지 직접 이동하는 단계입니다.' },
        { key: 'barcode-scan', label: '바코드 확인', description: '선반에서 꺼낸 상품의 바코드를 스캐너로 찍어, 지시서에 적힌 상품과 같은지 확인하는 단계입니다.' },
    ],
    WMS_PACKED: [
        { key: 'item-check', label: '상품 검수', description: '꺼내 온 상품의 수량과 상태(파손·오염 여부)를 사람이 눈으로 다시 한 번 확인하는 단계입니다.' },
        { key: 'box-select', label: '박스 선택', description: '상품 크기와 개수에 맞는 포장 박스를 골라, 운송 중 흔들리지 않게 담는 단계입니다.' },
        { key: 'label-print', label: '라벨 출력', description: '받는 사람 주소·운송장 번호가 적힌 스티커(송장)를 출력해서 박스에 붙이는 단계입니다.' },
        { key: 'weight-check', label: '중량 확인', description: '박스를 저울에 올려 무게를 재어, 빠진 물건이 없는지·운송비가 맞는지 마지막으로 검증합니다.' },
    ],
    WMS_DISPATCHED: [
        { key: 'dock-assign', label: '도크 배정', description: '출고할 박스를 어느 트럭 적재 자리(도크)로 보낼지 지정하는 단계입니다. 트럭마다 가는 지역이 달라 배정이 필요합니다.' },
        { key: 'dispatch-check', label: '출하 검수', description: '도크로 옮긴 박스가 실제로 보내려던 박스가 맞는지(개수·라벨) 마지막으로 한 번 더 확인합니다.' },
        { key: 'tms-request', label: 'TMS 요청', description: '운송 시스템(TMS)에 "이 박스 가져갈 차량을 보내달라"고 배차를 요청하는 단계입니다.' },
    ],
    WMS_COMPLETED: [
        { key: 'stock-confirm', label: '재고 차감 확정', description: '도크 인계(WMS_DISPATCHED) 시점에 예약해둔 재고를 "실제로 출고됨"으로 확정해 가용 재고 숫자를 차감하는 단계입니다.' },
        { key: 'audit-close', label: 'WMS 감사 로그 저장', description: '이번 출고의 입고·할당·피킹·패킹·출하 전 과정을 감사 로그로 닫아 추적 기록을 확정하는 단계입니다.' },
    ],
};

export function getInitialWmsStageWorkNodeKey(stage: WmsOutStage): WmsWorkNodeKey {
    return WMS_STAGE_WORK_NODES[stage][0].key as WmsWorkNodeKey;
}

export function getNextWmsStageWorkNodeKey(stage: WmsOutStage, key?: WmsWorkNodeKey): WmsWorkNodeKey | null {
    const nodes = WMS_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return (nodes[safeIndex + 1]?.key as WmsWorkNodeKey | undefined) ?? null;
}

export function getWmsStageWorkNodeLabel(stage: WmsOutStage, key?: WmsWorkNodeKey): string {
    const nodes = WMS_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

export type LogisticsStageWorkNode = {
    key: string;
    label: string;
    description?: string;
};

export type AftWorkNode = { key: string; label: string; description?: string };

export const AFT_STAGE_WORK_NODES: Record<AftStage, AftWorkNode[]> = {
    AFT_BILLING: [
        { key: 'oms-close-request', label: 'OMS 주문완결 요청', description: '배송 완료 이벤트를 받아 OMS에 주문완결 처리를 요청합니다.' },
        { key: 'billing-calc',      label: '대금·배송비 산출',  description: '주문 금액과 실배송비를 대조해 최종 청구액을 산출합니다.' },
        { key: 'billing-issue',     label: '청구서 발행',       description: '화주에게 발행할 청구서를 생성하고 전송합니다.' },
        { key: 'return-intake',     label: '반품 접수',         description: '고객 반품 요청이 있는 경우 반품 흐름을 개시합니다.' },
    ],
    AFT_CLOSED: [
        { key: 'cs-receive',    label: 'CS 접수·처리',   description: '배송 관련 고객 문의·불만을 접수하고 처리합니다.' },
        { key: 'settle-confirm', label: '정산 확정',     description: '청구·반품 처리 결과를 종합해 정산을 최종 확정합니다.' },
        { key: 'order-close',   label: '주문 최종 종결', description: '모든 후처리가 완료된 주문의 감사 로그를 닫고 종결 이벤트를 발행합니다.' },
    ],
};

export const AFT_STAGES: AftStage[] = ['AFT_BILLING', 'AFT_CLOSED'];

export function getInitialAftStageWorkNodeKey(stage: AftStage): string {
    return AFT_STAGE_WORK_NODES[stage][0].key;
}

export function getNextAftStageWorkNodeKey(stage: AftStage, key?: string): string | null {
    const nodes = AFT_STAGE_WORK_NODES[stage];
    const idx = nodes.findIndex(n => n.key === key);
    const safeIdx = idx >= 0 ? idx : 0;
    return nodes[safeIdx + 1]?.key ?? null;
}

export function getAftStageWorkNodeLabel(stage: AftStage, key?: string): string {
    const nodes = AFT_STAGE_WORK_NODES[stage];
    return nodes.find(n => n.key === key)?.label ?? nodes[0].label;
}

export function getStageWorkNodes(stage: TaskStage): LogisticsStageWorkNode[] {
    return [
        ...(OMS_STAGE_WORK_NODES[stage as OmsStage] ?? []),
        ...(WMS_STAGE_WORK_NODES[stage as WmsOutStage] ?? []),
        ...(QMS_STAGE_WORK_NODES[stage as QmsStage] ?? []),
        ...(TMS_STAGE_WORK_NODES[stage as TmsStage] ?? []),
        ...(EOS_STAGE_WORK_NODES[stage as EosStage] ?? []),
        ...(INBOUND_STAGE_WORK_NODES[stage as InboundStage] ?? []),
        ...(AFT_STAGE_WORK_NODES[stage as AftStage] ?? []),
    ];
}

export const INBOUND_STAGES: InboundStage[] = [
    'INBOUND_RECEIVED',
    'INBOUND_VALIDATED',
    'INBOUND_QC',
    'INBOUND_ZONE_ASSIGNED',
    'INBOUND_STORED',
    'INBOUND_COMPLETED',
];

export type InboundWorkNode = {
    key: string;
    label: string;
    description?: string;
};

export const INBOUND_STAGE_WORK_NODES: Record<InboundStage, InboundWorkNode[]> = {
    INBOUND_RECEIVED: [
        { key: 'handoff-receive', label: '핸드오프 수신', description: 'EOS PO 확정 후 입고 요청을 받아 WMS 입고 흐름에 등록하는 단계입니다.' },
        { key: 'task-register', label: '입고 작업 등록', description: '같은 task를 INBOUND 도메인 작업으로 식별해 추적 가능한 단위로 만듭니다.' },
    ],
    INBOUND_VALIDATED: [
        { key: 'item-verify', label: '품목 확인', description: '발주서와 실제 입고 품목이 일치하는지 확인합니다.' },
        { key: 'quantity-verify', label: '수량 확인', description: '요청 수량과 실제 입고 수량을 대조합니다.' },
    ],
    INBOUND_QC: [
        { key: 'visual-check', label: '외관 검사', description: '입고 상품의 파손·오염·변형을 육안으로 확인합니다.' },
        { key: 'label-check', label: '라벨 검사', description: '발주서 품목·수량과 실물 라벨이 일치하는지 확인합니다.' },
        { key: 'certificate-check', label: '성적서 확인', description: '공급사 품질 성적서·원산지 증명서 등 필수 서류를 점검합니다.' },
        { key: 'defect-decision', label: '불량 판정', description: '검사 항목 결과를 종합해 합격·반품·폐기 중 하나로 최종 결정합니다.' },
    ],
    INBOUND_ZONE_ASSIGNED: [
        { key: 'zone-pick', label: '보관 Zone 선택', description: '품목 특성(상온/냉장/대형)에 맞춰 보관 위치를 결정합니다.' },
        { key: 'location-allocate', label: '위치 할당', description: 'Zone 내부의 구체적인 선반/슬롯을 배정합니다.' },
    ],
    INBOUND_STORED: [
        { key: 'physical-store', label: '실물 적치', description: '배정된 위치로 실제 상품을 옮겨 보관합니다.' },
        { key: 'stock-apply', label: '재고 반영', description: '입고 수량을 가용 재고에 더해 출고 가능 상태로 만듭니다.' },
    ],
    INBOUND_COMPLETED: [
        { key: 'stock-apply-confirm', label: '재고 반영 확정', description: '입고 수량이 가용 재고에 정상 반영됐는지 최종 확인합니다.' },
        { key: 'audit-close', label: '입고 감사 로그', description: '입고 전 과정의 감사 로그를 닫고 추적 기록을 확정합니다.' },
        { key: 'eos-close-handoff', label: 'EOS 입고 완결 통보', description: 'EOS 측에 입고 완결을 통보해 발주 사이클을 종료합니다.' },
        { key: 'handoff-close', label: '입고 종료', description: '입고 흐름을 닫고 후속 출고/QMS 흐름이 참조 가능하도록 마무리합니다.' },
    ],
};

export function getInitialInboundStageWorkNodeKey(stage: InboundStage): string {
    return INBOUND_STAGE_WORK_NODES[stage][0].key;
}

export function getNextInboundStageWorkNodeKey(stage: InboundStage, key?: string): string | null {
    const nodes = INBOUND_STAGE_WORK_NODES[stage];
    const currentIndex = nodes.findIndex(node => node.key === key);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    return nodes[safeIndex + 1]?.key ?? null;
}

export function getInboundStageWorkNodeLabel(stage: InboundStage, key?: string): string {
    const nodes = INBOUND_STAGE_WORK_NODES[stage];
    return nodes.find(node => node.key === key)?.label ?? nodes[0].label;
}

export const WMS_OUT_STAGES: WmsOutStage[] = [
    'WMS_RECEIVED',
    'WMS_ALLOCATED',
    'WMS_PICKING',
    'WMS_PACKED',
    'WMS_DISPATCHED',
    'WMS_COMPLETED',
];

export const QMS_STAGES: QmsStage[] = [
    'QMS_REQUESTED',
    'QMS_SAMPLING',
    'QMS_INSPECTING',
    'QMS_JUDGED',
    'QMS_RELEASED',
];

export const EOS_STAGES: EosStage[] = [
    'EOS_FORECASTED',
    'EOS_REORDER_TRIGGERED',
    'EOS_SUPPLIER_SELECTED',
    'EOS_PO_ISSUED',
    'EOS_PO_DISPATCHED',
    'EOS_PO_CONFIRMED',
];

export const TMS_STAGES: TmsStage[] = [
    'TMS_REQUESTED',
    'TMS_VEHICLE_ASSIGNED',
    'TMS_LOADED',
    'TMS_DELIVERING',
    'TMS_DELIVERED',
];

// ORDER 태스크 파이프라인: 피킹·패킹 → QMS 검수 → WMS 출하완료 → TMS 배송 → AFT 정산·종결
// 재고차감: WMS_DISPATCHED(도크 인계) 시점. WMS_COMPLETED = WMS 업무 종료 확정. AFT = 배송 후 정산·CS·종결.
export const PIPELINE_STAGES: TaskStage[] = [
    ...OMS_STAGES,
    'WMS_RECEIVED', 'WMS_ALLOCATED', 'WMS_PICKING', 'WMS_PACKED',
    ...QMS_STAGES,
    'WMS_DISPATCHED', 'WMS_COMPLETED',
    ...TMS_STAGES,
    ...AFT_STAGES,
];

export const EOS_PIPELINE: TaskStage[] = [
    ...EOS_STAGES,
    ...INBOUND_STAGES,
];

export const FINAL_STAGE: TaskStage = 'AFT_CLOSED';
export const INBOUND_FINAL_STAGE: TaskStage = 'INBOUND_COMPLETED';

export const STAGE_LABELS: Record<TaskStage, string> = {
    OMS_RECEIVED:          '접수',
    OMS_VALIDATED:         '검증',
    OMS_WMS_REQUESTED:     'WMS 전송',
    INBOUND_RECEIVED:      '등록',
    INBOUND_VALIDATED:     '유효성',
    INBOUND_QC:            'IQC',
    INBOUND_ZONE_ASSIGNED: 'Zone',
    INBOUND_STORED:        '반영',
    INBOUND_COMPLETED:     '완료',
    WMS_RECEIVED:          '접수',
    WMS_ALLOCATED:         '할당',
    WMS_PICKING:           '피킹',
    WMS_PACKED:            '패킹',
    WMS_DISPATCHED:        '출하',
    WMS_COMPLETED:         '출하완료',
    QMS_REQUESTED:        '검사요청',
    QMS_SAMPLING:         '샘플추출',
    QMS_INSPECTING:       '검사진행',
    QMS_JUDGED:           '판정',
    QMS_RELEASED:         '출고승인',
    TMS_REQUESTED:         '배차요청',
    TMS_VEHICLE_ASSIGNED:  '차량배정',
    TMS_LOADED:            '상차',
    TMS_DELIVERING:        '운송',
    TMS_DELIVERED:         '인도',
    EOS_FORECASTED:         '수요예측',
    EOS_REORDER_TRIGGERED:  '발주점',
    EOS_SUPPLIER_SELECTED:  '공급사선정',
    EOS_PO_ISSUED:          '발주서발행',
    EOS_PO_DISPATCHED:      '공급사송신',
    EOS_PO_CONFIRMED:       '수신확인',
    AFT_BILLING: '정산처리',
    AFT_CLOSED:  '주문종결',
};

export type StageGuidance = {
    title: string;
    summary: string;
    meaning: string;
    watch: string;
    next: string;
};

export const STAGE_GUIDANCE: Record<TaskStage, StageGuidance> = {
    OMS_RECEIVED: {
        title: '주문 접수 확인',
        summary: '주문이 들어와 처리 흐름에 올라온 상태입니다.',
        meaning: '화주 주문을 OMS가 접수했고, 이제 검증 가능한 업무 단위로 정리하는 중입니다.',
        watch: '화주, 품목, 수량, 도착지 정보가 빠지면 다음 검증에서 멈출 수 있습니다.',
        next: '입력값이 자연스러운지 보고, 이상 신호가 없으면 검증 단계로 넘어가는지 확인합니다.',
    },
    OMS_VALIDATED: {
        title: '주문 조건 검증',
        summary: '주문을 WMS로 넘겨도 되는지 확인하는 상태입니다.',
        meaning: '화주와 품목, 도착지, 수량 조건을 확인해 창고 실행 전에 기본 오류를 걸러냅니다.',
        watch: '검증 실패가 나면 자동 재시도보다 운영자 판단이 먼저 필요합니다.',
        next: '실패 라벨과 조치 버튼을 보고 승인 요청, 반려, 재검증 중 맞는 흐름을 선택합니다.',
    },
    OMS_WMS_REQUESTED: {
        title: 'WMS 작업 요청',
        summary: '검증된 주문을 창고 작업으로 넘기는 상태입니다.',
        meaning: 'OMS 업무가 끝나고 WMS 출고 작업이 만들어지도록 이벤트를 보내는 구간입니다.',
        watch: '전송 실패는 주문 문제가 아니라 연결 또는 메시지 처리 문제일 가능성이 높습니다.',
        next: 'WMS 접수 카드가 생기는지, 실패 시 재시도 또는 DLQ 흐름으로 넘어가는지 봅니다.',
    },
    INBOUND_RECEIVED: {
        title: '입고 등록 접수',
        summary: '입고 요청이 WMS 보조 흐름에 들어온 상태입니다.',
        meaning: 'OMS 관문을 거친 입고 요청이 창고에서 확인 가능한 작업으로 등록됐습니다.',
        watch: '입고는 출고 메인 흐름을 보조하므로, 여기서 오래 머무르면 상류 병목으로 읽습니다.',
        next: '화주와 품목 정보가 맞는지 확인하고 유효성 단계로 이동하는지 봅니다.',
    },
    INBOUND_VALIDATED: {
        title: '입고 정보 검증',
        summary: '입고 자료가 재고에 반영될 수 있는지 확인하는 상태입니다.',
        meaning: '입고 품목과 수량, 화주 정보를 점검해 잘못된 재고 반영을 막습니다.',
        watch: '검증 오류를 놓치면 Zone 배정과 재고 수량이 모두 틀어질 수 있습니다.',
        next: '실패 원인이 데이터 문제인지 운영자 승인 문제인지 먼저 구분합니다.',
    },
    INBOUND_QC: {
        title: '입고 품질 검수(IQC)',
        summary: '입고 상품의 외관·라벨·서류를 검사해 재고 반영 전 불량을 차단하는 상태입니다.',
        meaning: '외관 파손, 라벨 불일치, 성적서 누락을 걸러내 창고 내 불량 재고 유입을 막습니다.',
        watch: '검수 실패 시 반품/폐기 처리가 명확히 이어져야 재고 오염을 막을 수 있습니다.',
        next: '합격 판정이 나면 Zone 배정으로 진행하고, 불합격이면 반품·폐기 조치가 따르는지 확인합니다.',
    },
    INBOUND_ZONE_ASSIGNED: {
        title: '보관 Zone 배정',
        summary: '입고 상품을 어느 보관 위치로 보낼지 정하는 상태입니다.',
        meaning: '상품 특성과 창고 상황에 맞춰 상온, 냉장, 냉동, 대형 Zone 중 보관 위치를 잡습니다.',
        watch: 'Zone 대기나 온도대 불일치는 이후 재고 반영 지연으로 이어질 수 있습니다.',
        next: '배정된 Zone이 업무적으로 납득되는지 보고, 재고 반영 단계로 넘어가는지 확인합니다.',
    },
    INBOUND_STORED: {
        title: '재고 반영',
        summary: '입고 수량을 재고 현황에 반영하는 상태입니다.',
        meaning: '실제 보관 위치가 확정된 입고 수량을 출고 가능 재고 맥락에 연결합니다.',
        watch: '반영이 늦으면 출고 할당에서 재고가 부족해 보이는 상황이 생길 수 있습니다.',
        next: '재고 반영 완료 이벤트가 남고 입고 흐름이 닫히는지 확인합니다.',
    },
    INBOUND_COMPLETED: {
        title: '입고 완료',
        summary: '입고 보조 흐름이 정상 종료된 상태입니다.',
        meaning: '입고 등록부터 재고 반영까지 끝나 출고 흐름에 영향을 줄 수 있는 준비가 마무리됐습니다.',
        watch: '완료된 입고를 계속 메인 병목으로 읽으면 출고 상황 판단이 흐려질 수 있습니다.',
        next: '필요하면 전체 로그에서 연결 이벤트만 확인하고, 메인 출고 흐름으로 시선을 돌립니다.',
    },
    WMS_RECEIVED: {
        title: '창고 작업 접수',
        summary: 'WMS가 출고 요청을 받아 창고 작업을 시작한 상태입니다.',
        meaning: 'OMS에서 넘어온 주문이 출고 작업으로 생성되어 WMS 7단 흐름에 올라왔습니다.',
        watch: '같은 요청이 중복 접수되면 이후 할당과 피킹이 중복 실행될 수 있습니다.',
        next: '작업 카드가 하나만 생성됐는지 보고 재고 할당 단계로 이동하는지 확인합니다.',
    },
    WMS_ALLOCATED: {
        title: '재고 할당',
        summary: '주문에 필요한 재고를 확보하는 상태입니다.',
        meaning: '출고에 필요한 수량을 실제 재고에서 잡아두는 창고 실행의 핵심 병목 구간입니다.',
        watch: '재고 부족, 동시 요청, Zone 불일치가 있으면 여기서 실패하거나 대기합니다.',
        next: '할당 실패 라벨이 있는지 보고, 정상이라면 피킹 지시가 생성되는지 확인합니다.',
    },
    WMS_PICKING: {
        title: '피킹 진행',
        summary: '작업자가 상품을 찾아 꺼내는 상태입니다.',
        meaning: '할당된 재고를 실제 창고 위치에서 찾아 출고 준비 위치로 옮기는 구간입니다.',
        watch: '품절 발견이나 위치 불일치가 있으면 피킹 실패로 바뀔 수 있습니다.',
        next: '작업자와 Zone 정보가 자연스러운지 보고 패킹 단계로 넘어가는지 봅니다.',
    },
    WMS_PACKED: {
        title: '패킹 완료',
        summary: '상품 포장이 끝나 출하 준비가 된 상태입니다.',
        meaning: '피킹된 상품에 박스 번호와 무게 정보를 붙여 운송으로 넘길 수 있게 정리합니다.',
        watch: '박스 정보가 없으면 이후 출하와 운송 추적에서 식별이 어려워집니다.',
        next: '박스 번호가 표시되는지 확인하고 출하 요청으로 이어지는지 봅니다.',
    },
    WMS_DISPATCHED: {
        title: '출하 완료',
        summary: 'WMS가 상품을 TMS 운송 흐름으로 넘긴 상태입니다.',
        meaning: '창고 내부 작업이 끝나고 배차와 운송을 담당하는 TMS로 책임이 이동합니다.',
        watch: 'TMS 요청이 실패하면 창고 작업은 끝났지만 운송이 시작되지 않은 상태가 됩니다.',
        next: '배차 요청 이벤트가 생기고 TMS 카드가 이어지는지 확인합니다.',
    },
    WMS_COMPLETED: {
        title: 'WMS 출하 완료',
        summary: '도크 인계 후 재고 차감을 확정하고 WMS 업무를 종료하는 상태입니다.',
        meaning: 'WMS_DISPATCHED에서 캐리어에 넘긴 시점을 기준으로 예약 재고를 실차감 확정하고, WMS 감사 로그를 닫습니다. 이후 TMS가 배송을 담당합니다.',
        watch: '재고 차감 확정 실패 시 재고 숫자가 틀어지므로 즉시 보정이 필요합니다.',
        next: '전체 로그나 목록 탭에서 필요할 때만 다시 확인합니다.',
    },
    QMS_REQUESTED: {
        title: '품질 검사 요청 접수',
        summary: 'WMS 패킹 완료 이후 QMS가 검사 업무를 받아 처리 흐름에 올린 상태입니다.',
        meaning: '출고 전 마지막 품질 게이트의 시작점으로, 배치 정보·검사 정책·우선순위를 확정해 샘플링 단계를 준비합니다.',
        watch: 'WMS 패킹 완료 이벤트가 누락되거나 배치·정책 조회에 실패하면 이 단계에서 흐름이 멈춥니다.',
        next: '배치·정책·검사 유형이 정상 매칭됐는지 확인하고, 샘플링 큐로 넘어가는지 봅니다.',
    },
    QMS_SAMPLING: {
        title: '검사 샘플 추출',
        summary: '검사 대상 품목을 무작위 추출해 검사 준비를 마치는 상태입니다.',
        meaning: 'AQL 기준으로 표본 수와 합격 한계를 계산하고, 실물 샘플을 뽑아 검사자·장비·체크리스트를 배정합니다.',
        watch: 'AQL 계산 오류, 재고 부족, 검사자 미배정이 누적되면 검사 자체가 지연될 수 있습니다.',
        next: '샘플이 정상 등록됐는지, 검사자와 장비 준비가 완료됐는지 확인합니다.',
    },
    QMS_INSPECTING: {
        title: '품목 검사 진행',
        summary: '추출된 샘플을 대상으로 외관·중량·라벨·기능·포장을 점검하는 상태입니다.',
        meaning: '계측 도구 영점 확인부터 각 검사 항목 기록·증빙 수집까지 실제 품질 판정의 근거를 만드는 구간입니다.',
        watch: '계측 오류, 결품 의심, 라벨 불일치가 이 단계에서 발견되면 검사가 중단되거나 재검사로 넘어갑니다.',
        next: '각 검사 항목이 빠짐없이 기록됐는지, 증빙 업로드가 완료됐는지 확인합니다.',
    },
    QMS_JUDGED: {
        title: '품질 판정',
        summary: '검사 결과를 기준에 대조해 Pass / Fail / Hold를 결정하는 상태입니다.',
        meaning: '합격 기준을 로드해 검사 항목별로 대조하고, 결함 등급(치명/중대/경미)을 분류한 뒤 최종 판정을 내립니다.',
        watch: '기준 미등록, 규칙 충돌, 권한자 부재가 있으면 판정이 지연되거나 수동 에스컬레이션이 필요합니다.',
        next: 'Pass면 출고승인으로 이동, Hold면 격리 라우팅, Fail이면 반품·폐기 분기가 맞게 실행됐는지 봅니다.',
    },
    QMS_RELEASED: {
        title: '출고 최종 승인',
        summary: '품질 판정 통과 후 TMS 배차 요청으로 넘기는 최종 승인 상태입니다.',
        meaning: '출고 승인서·품질 인증서·추적성 ID를 묶어 TMS 인계 이벤트를 발행하고 QMS 흐름을 완전히 마감합니다.',
        watch: 'TMS 인계 타임아웃, ACK 누락, 추적성 ID 단절이 있으면 배차가 지연되거나 미확인 상태로 빠질 수 있습니다.',
        next: 'TMS 배차 요청 이벤트가 정상 발행됐는지, ACK 수신이 확인됐는지, QMS 종료 이벤트가 남았는지 봅니다.',
    },
    TMS_REQUESTED: {
        title: '배차 요청 접수',
        summary: '운송을 시작하기 위해 차량 배정을 요청한 상태입니다.',
        meaning: 'WMS 출하가 끝난 뒤 TMS가 운송 업무를 받을 준비를 시작합니다.',
        watch: '요청이 쌓이면 차량 배정 전 병목이 생긴 것으로 볼 수 있습니다.',
        next: '차량 배정 이벤트가 이어지는지 보고, 실패하면 배차 조치 후보를 확인합니다.',
    },
    TMS_VEHICLE_ASSIGNED: {
        title: '차량 배정',
        summary: '운송에 사용할 차량이 정해진 상태입니다.',
        meaning: '배송을 맡을 차량과 운송 단위가 연결되어 상차 준비가 가능해졌습니다.',
        watch: '차량 정보가 없거나 배정이 지연되면 운송 시작 전 대기 상태로 읽습니다.',
        next: '차량 ID가 표시되는지 보고 상차 단계로 이동하는지 확인합니다.',
    },
    TMS_LOADED: {
        title: '상차 완료',
        summary: '상품이 차량에 실려 운송을 시작할 준비가 된 상태입니다.',
        meaning: '창고 출하물과 배정 차량이 실제로 연결되어 이동 직전 단계에 도달했습니다.',
        watch: '상차 후 운송 이벤트가 늦으면 출발 대기 또는 운송 연동 지연으로 봅니다.',
        next: '운송 진행 이벤트와 위치 업데이트가 이어지는지 확인합니다.',
    },
    TMS_DELIVERING: {
        title: '운송 진행',
        summary: '상품이 목적지로 이동 중인 상태입니다.',
        meaning: '차량이 이동 중이며 Track & Trace 이벤트로 흐름을 따라볼 수 있습니다.',
        watch: '운송 단계는 오래 머물 수 있으므로 실패와 단순 체류를 구분해야 합니다.',
        next: '최근 이벤트 시각과 인도 완료 직전 여부를 함께 확인합니다.',
    },
    TMS_DELIVERED: {
        title: '인도 완료',
        summary: '고객 또는 목적지에 상품 인도가 끝난 상태입니다.',
        meaning: 'TMS 운송이 종료된 시점입니다. 이 신호를 받아 AFT 정산 흐름(대금 청구·주문 종결)이 시작됩니다.',
        watch: '인도 실패나 수취 거부가 있었다면 AFT 반품 접수 흐름으로 분기될 수 있습니다.',
        next: 'AFT_BILLING 정산 처리가 이어지는지 확인합니다.',
    },
    EOS_FORECASTED: {
        title: '수요예측 완료',
        summary: '품목별 향후 수요량 예측을 마친 상태입니다.',
        meaning: '자동발주 판단의 첫 단계로 예측 모델이 수요량을 산출했습니다.',
        watch: '예측 신뢰도가 낮으면 이후 발주점 평가가 잘못된 결정을 내릴 수 있습니다.',
        next: '예측 결과가 다음 발주점 단계로 자연스럽게 인계되는지 확인합니다.',
    },
    EOS_REORDER_TRIGGERED: {
        title: '발주점 도달',
        summary: '재고가 발주점(ROP) 이하로 떨어져 발주 트리거가 발행된 상태입니다.',
        meaning: '예측 수요와 현재 재고를 비교해 발주가 필요하다고 판단한 구간입니다.',
        watch: 'ROP 임계가 잘못 설정되어 있으면 과발주 또는 결품이 발생할 수 있습니다.',
        next: '공급사 선정 단계로 넘어가는지 확인합니다.',
    },
    EOS_SUPPLIER_SELECTED: {
        title: '공급사 선정',
        summary: '발주 대상 품목에 대한 공급사를 선정한 상태입니다.',
        meaning: '단가·납기·품질 점수로 가장 적합한 공급사를 결정한 구간입니다.',
        watch: '공급사 평가 데이터가 부족하면 선정 근거가 약해질 수 있습니다.',
        next: '선정된 공급사로 발주서가 작성되는지 확인합니다.',
    },
    EOS_PO_ISSUED: {
        title: '발주서 발행',
        summary: '내부 승인을 거쳐 정식 발주번호가 부여된 상태입니다.',
        meaning: '발주서가 공식 문서로 시스템에 영속화되어 공급사 송신을 기다리는 구간입니다.',
        watch: '승인 한도 초과나 발주번호 중복이 있으면 발행이 멈출 수 있습니다.',
        next: '공급사 송신 단계로 넘어가는지 확인합니다.',
    },
    EOS_PO_DISPATCHED: {
        title: '공급사 송신',
        summary: '발주서를 공급사에 송신한 상태입니다.',
        meaning: 'EDI·이메일·API 채널로 발주서를 공급사에 전달한 구간입니다. 외부 시스템 연동 지점입니다.',
        watch: '송신 실패나 ACK 미수신은 인프라 실패로 분류해 재시도가 필요합니다.',
        next: '공급사 수신확인을 기다리는 단계로 이어지는지 확인합니다.',
    },
    EOS_PO_CONFIRMED: {
        title: '공급사 수신확인',
        summary: '공급사가 발주를 수락하고 수신확인을 보낸 상태입니다.',
        meaning: 'EOS 책임 영역이 종료되고 입고 흐름으로 핸드오프되는 구간입니다.',
        watch: '수신확인이 길어지면 공급사 거부 가능성을 검토해야 합니다.',
        next: '같은 task가 INBOUND_RECEIVED로 전이되어 WMS 입고 흐름이 시작되는지 확인합니다.',
    },
    AFT_BILLING: {
        title: '배송 후 정산 처리',
        summary: 'TMS 배송 완료 후 대금 청구와 OMS 주문완결을 처리하는 상태입니다.',
        meaning: '배송이 확인된 주문에 대해 배송비·대금을 산출하고 청구서를 화주에게 발행합니다.',
        watch: '산출 오류나 OMS 연동 실패 시 정산이 지연되어 미결 주문이 누적될 수 있습니다.',
        next: '청구서 발행이 완료되면 종결 단계로 진행하는지 확인합니다.',
    },
    AFT_CLOSED: {
        title: '주문 최종 종결',
        summary: '정산과 CS 처리를 마치고 주문을 완전히 닫는 상태입니다.',
        meaning: '모든 후처리가 완료된 주문의 감사 로그를 닫고 최종 종결 이벤트를 발행합니다.',
        watch: '종결 처리 실패 시 열린 주문이 잔존해 정산 리포트가 불일치할 수 있습니다.',
        next: '주문 종결 이벤트가 발행되고 task가 completed 상태로 전환되는지 확인합니다.',
    },
};

export const STAGE_DOMAIN: Record<TaskStage, 'OMS' | 'WMS' | 'QMS' | 'TMS' | 'EOS' | 'AFT'> = {
    OMS_RECEIVED:         'OMS',
    OMS_VALIDATED:        'OMS',
    OMS_WMS_REQUESTED:    'OMS',
    INBOUND_RECEIVED:     'WMS',
    INBOUND_VALIDATED:    'WMS',
    INBOUND_QC:           'WMS',
    INBOUND_ZONE_ASSIGNED:'WMS',
    INBOUND_STORED:       'WMS',
    INBOUND_COMPLETED:    'WMS',
    WMS_RECEIVED:         'WMS',
    WMS_ALLOCATED:        'WMS',
    WMS_PICKING:          'WMS',
    WMS_PACKED:           'WMS',
    WMS_DISPATCHED:       'WMS',
    WMS_COMPLETED:        'WMS',
    QMS_REQUESTED:        'QMS',
    QMS_SAMPLING:         'QMS',
    QMS_INSPECTING:       'QMS',
    QMS_JUDGED:           'QMS',
    QMS_RELEASED:         'QMS',
    TMS_REQUESTED:        'TMS',
    TMS_VEHICLE_ASSIGNED: 'TMS',
    TMS_LOADED:           'TMS',
    TMS_DELIVERING:       'TMS',
    TMS_DELIVERED:        'TMS',
    EOS_FORECASTED:         'EOS',
    EOS_REORDER_TRIGGERED:  'EOS',
    EOS_SUPPLIER_SELECTED:  'EOS',
    EOS_PO_ISSUED:          'EOS',
    EOS_PO_DISPATCHED:      'EOS',
    EOS_PO_CONFIRMED:       'EOS',
    AFT_BILLING: 'AFT',
    AFT_CLOSED:  'AFT',
};

// Routing Key 맵 — {aggregate}.{verb}.{past-tense}
export const STAGE_ROUTING_KEY: Record<TaskStage, string> = {
    OMS_RECEIVED:         'order.received',
    OMS_VALIDATED:        'order.validated',
    OMS_WMS_REQUESTED:    'order.wms.requested',
    INBOUND_RECEIVED:     'inbound.received',
    INBOUND_VALIDATED:    'inbound.validated',
    INBOUND_QC:           'inbound.qc.inspected',
    INBOUND_ZONE_ASSIGNED:'inbound.zone.assigned',
    INBOUND_STORED:       'inbound.stored',
    INBOUND_COMPLETED:    'inbound.completed',
    WMS_RECEIVED:         'shipment.received',
    WMS_ALLOCATED:        'shipment.allocated',
    WMS_PICKING:          'shipment.picking.started',
    WMS_PACKED:           'shipment.packed',
    WMS_DISPATCHED:       'shipment.dispatched',
    WMS_COMPLETED:        'shipment.completed',
    QMS_REQUESTED:        'quality.requested',
    QMS_SAMPLING:         'quality.sampling.started',
    QMS_INSPECTING:       'quality.inspecting',
    QMS_JUDGED:           'quality.judged',
    QMS_RELEASED:         'quality.released',
    TMS_REQUESTED:        'dispatch.requested',
    TMS_VEHICLE_ASSIGNED: 'dispatch.vehicleAssigned',
    TMS_LOADED:           'dispatch.loaded',
    TMS_DELIVERING:       'dispatch.delivering',
    TMS_DELIVERED:        'dispatch.delivered',
    EOS_FORECASTED:         'eos.forecast.completed',
    EOS_REORDER_TRIGGERED:  'eos.reorder.triggered',
    EOS_SUPPLIER_SELECTED:  'eos.supplier.selected',
    EOS_PO_ISSUED:          'eos.po.issued',
    EOS_PO_DISPATCHED:      'eos.po.dispatched',
    EOS_PO_CONFIRMED:       'eos.po.confirmed',
    AFT_BILLING: 'aft.billing.started',
    AFT_CLOSED:  'aft.order.closed',
};

export function getStageTicks(stage?: TaskStage): number {
    return LOGISTICS_STAGE_TICKS;
}

export function randomTicks(): number {
    return LOGISTICS_STAGE_TICKS;
}

export function getPipelineStagesForTask(task: Pick<LogisticsTask, 'type'>): TaskStage[] {
    if (task.type === 'INBOUND') return INBOUND_STAGES;
    if (task.type === 'EOS') return EOS_PIPELINE;
    return PIPELINE_STAGES;
}

export function getFinalStageForTask(task: Pick<LogisticsTask, 'type'>): TaskStage {
    return task.type === 'INBOUND' || task.type === 'EOS' ? INBOUND_FINAL_STAGE : FINAL_STAGE;
}

export function getWorkNodeDescription(stage: TaskStage, nodeKey?: string): string | undefined {
    if (!nodeKey) return undefined;
    return getStageWorkNodes(stage).find(n => n.key === nodeKey)?.description;
}
