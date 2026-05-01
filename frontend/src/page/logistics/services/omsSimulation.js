import { createTask, getAllTasks } from '@/store/taskStore';
import { appendEvent } from '@/store/eventStore';
import { getFocusedTaskId, applyAutoFocus } from '@/store/focusStore';
import { randomTicks } from '@/domain/logistics/common/stages';
import { dlog } from '@/global/chs';
import generateUUID from '@/shared/lib/generateUUID';
import { getSimulationSettings } from './simulationSettings';

export const OWNER_OPTIONS = [
    '한빛리테일',
    '도담상사',
    '새온생활',
    '그린유통',
    '오름커머스',
    '바른마켓',
    '서해물산',
    '다온로지스',
    '미래푸드',
    '에코홈케어',
];
export const ITEM_OPTIONS = [
    '상온-음료',
    '냉동-만두',
    '생활-세제',
    '유아-기저귀',
    '헬스-보충제',
    '주방-키친타월',
    '간편식-볶음밥',
    '반찬-김치',
    '펫-배변패드',
    '뷰티-선크림',
];
export const DESTINATION_OPTIONS = [
    '서울 서초',
    '인천 항동',
    '부산 강서',
    '대전 대덕',
    '광주 장성',
    '대구 달성',
    '울산 북구',
    '세종 연서',
    '경기 화성',
    '경남 양산',
];

const AUTO_MIN_MS = 2000;
const AUTO_MAX_MS = 8000;
const BULK_COUNT = 20;
const BULK_MIN_MS = 1000;
const BULK_MAX_MS = 2000;

let autoTimerId = null;
let autoRunning = false;

function randomPick(values) {
    return values[Math.floor(Math.random() * values.length)];
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toOwnerCode(owner) {
    return owner.slice(0, 2);
}

async function nextSequence(prefix, owner) {
    const tasks = await getAllTasks();
    const ownerCode = toOwnerCode(owner);
    const count = tasks.filter(task => task.taskId.startsWith(`${prefix}-${ownerCode}-`)).length + 1;
    return String(count).padStart(3, '0');
}

function buildCommonTask({
    taskId,
    type,
    owner,
    itemCode,
    quantity,
    destination,
    actor,
    sourceChannel,
    ownerView,
    currentStage,
}) {
    const now = Date.now();
    const simulationSettings = getSimulationSettings();

    return {
        taskId,
        type,
        correlationId: generateUUID(),
        owner,
        itemCode,
        quantity,
        destination,
        currentStage,
        status: 'active',
        actor,
        sourceChannel,
        ownerView,
        createdAt: now,
        updatedAt: now,
        idempotencyKey: `${taskId}:${now}`,
        ticksInCurrentStage: 0,
        ticksTarget: randomTicks(),
        simulationGlobalFailureRate: simulationSettings.globalFailureRate,
        simulationStageOverrides: { ...simulationSettings.stageOverrides },
    };
}

async function buildOrderTask(input) {
    const seq = await nextSequence('ORD', input.owner);
    const taskId = `ORD-${toOwnerCode(input.owner)}-${seq}`;
    return buildCommonTask({
        ...input,
        taskId,
        type: 'ORDER',
        currentStage: 'OMS_RECEIVED',
    });
}

async function buildInboundTask(input) {
    const seq = await nextSequence('IN', input.owner);
    const taskId = `IN-${toOwnerCode(input.owner)}-${seq}`;
    return buildCommonTask({
        ...input,
        taskId,
        type: 'INBOUND',
        currentStage: 'INBOUND_RECEIVED',
    });
}

async function persistTask(task) {
    await createTask(task);
    const isInbound = task.type === 'INBOUND';
    const routingKey = isInbound ? 'inbound.received' : 'order.received';
    await appendEvent({
        eventId: generateUUID(),
        eventType: routingKey,
        routingKey,
        aggregateId: task.taskId,
        payload: {
            owner: task.owner,
            itemCode: task.itemCode,
            quantity: task.quantity,
            destination: task.destination,
            stage: task.currentStage,
            type: task.type,
            sourceChannel: task.sourceChannel,
        },
        eventVersion: '1.0',
        actor: task.actor,
        timestamp: Date.now(),
        correlationId: task.correlationId,
        idempotencyKey: `${task.taskId}:${routingKey}`,
    });

    if (getFocusedTaskId() === null) {
        applyAutoFocus(task.taskId);
    }
}

function normalizeActor(source, owner, ownerView) {
    if (source === 'auto') return 'system';
    if (ownerView) return `owner:${owner}`;
    return 'operator';
}

function normalizeInput(input = {}, fallbackSource = 'operator', fallbackInbound = false) {
    const owner = input.owner ?? randomPick(OWNER_OPTIONS);
    const itemCode = input.itemCode ?? randomPick(ITEM_OPTIONS);
    const quantity = Number(input.quantity ?? (Math.floor(Math.random() * 12) + 1));
    const destination = input.destination ?? randomPick(DESTINATION_OPTIONS);
    const sourceChannel = input.sourceChannel ?? fallbackSource;
    const ownerView = Boolean(input.ownerView);
    const actor = input.actor ?? normalizeActor(sourceChannel, owner, ownerView);

    return {
        owner,
        itemCode,
        quantity: Math.max(1, quantity),
        destination,
        actor,
        sourceChannel,
        ownerView,
        inbound: Boolean(input.inbound ?? fallbackInbound),
    };
}

export async function createOmsTask(input = {}) {
    const normalized = normalizeInput(input, input.sourceChannel ?? 'operator', input.inbound);
    const task = normalized.inbound
        ? await buildInboundTask(normalized)
        : await buildOrderTask(normalized);

    await persistTask(task);
    dlog(1, `omsSimulation.createOmsTask — ${task.type} ${normalized.sourceChannel} 경로 접수`, task.taskId);
    if (task.type === 'INBOUND') {
        dlog(2, 'omsSimulation.createOmsTask — OMS 단일 진입 관문에서 inbound.received 발행 후 WMS 입고 축약 띠로 승계 (REQ-T2-013 [pu])', task.taskId);
    }
    return task;
}

export async function createRandomOmsOrder(source = 'operator') {
    return createOmsTask({ sourceChannel: source, inbound: false });
}

export async function createRandomInboundTask(source = 'operator') {
    return createOmsTask({ sourceChannel: source, inbound: true });
}

async function scheduleNextAutoOrder() {
    if (!autoRunning) return;

    autoTimerId = window.setTimeout(async () => {
        try {
            await createRandomOmsOrder('auto');
        } finally {
            scheduleNextAutoOrder();
        }
    }, randomDelay(AUTO_MIN_MS, AUTO_MAX_MS));
}

export function startAutoOmsOrders() {
    if (autoRunning) return;
    autoRunning = true;
    scheduleNextAutoOrder();
}

export function stopAutoOmsOrders() {
    autoRunning = false;
    if (autoTimerId !== null) {
        window.clearTimeout(autoTimerId);
        autoTimerId = null;
    }
}

export async function createBulkOmsOrders(onProgress) {
    dlog(3, 'omsSimulation.createBulkOmsOrders — 요약 카드/중단 안전성/부분 실패 집계는 단계3 구현');

    for (let index = 0; index < BULK_COUNT; index += 1) {
        const inbound = index % 5 === 0;
        await createOmsTask({ sourceChannel: 'bulk', inbound });
        onProgress?.(index + 1, BULK_COUNT);
        if (index < BULK_COUNT - 1) {
            await new Promise(resolve => window.setTimeout(resolve, randomDelay(BULK_MIN_MS, BULK_MAX_MS)));
        }
    }
}
