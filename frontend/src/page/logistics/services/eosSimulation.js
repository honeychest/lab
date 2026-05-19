import { createTask, getAllTasks } from '@/store/taskStore';
import { appendEvent } from '@/store/eventStore';
import { getFocusedTaskId, applyAutoFocus } from '@/store/focusStore';
import { getInitialEosStageWorkNodeKey, EOS_WORK_NODE_TICKS } from '@/domain/logistics/common/stages';
import { dlog, dtag } from '@/global/chs';
import generateUUID from '@/shared/lib/generateUUID';
import { getSimulationSettings } from './simulationSettings';
import { OWNER_OPTIONS, ITEM_OPTIONS } from './omsSimulation';

const AUTO_MIN_MS = 4000;
const AUTO_MAX_MS = 12000;

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

async function nextSequence(owner) {
    const tasks = await getAllTasks();
    const ownerCode = toOwnerCode(owner);
    const count = tasks.filter(task => task.taskId.startsWith(`PO-${ownerCode}-`)).length + 1;
    return String(count).padStart(3, '0');
}

function normalizeInput(input = {}, fallbackSource = 'auto') {
    const owner = input.owner ?? randomPick(OWNER_OPTIONS);
    const itemCode = input.itemCode ?? randomPick(ITEM_OPTIONS);
    const quantity = Number(input.quantity ?? (Math.floor(Math.random() * 100) + 20));
    const sourceChannel = input.sourceChannel ?? fallbackSource;
    const actor = input.actor ?? (sourceChannel === 'auto' ? 'system' : 'operator');

    return {
        owner,
        itemCode,
        quantity: Math.max(1, quantity),
        sourceChannel,
        actor,
    };
}

async function buildEosTask(input) {
    const seq = await nextSequence(input.owner);
    const taskId = `PO-${toOwnerCode(input.owner)}-${seq}`;
    const now = Date.now();
    const simulationSettings = getSimulationSettings();

    return {
        taskId,
        type: 'EOS',
        correlationId: generateUUID(),
        owner: input.owner,
        itemCode: input.itemCode,
        quantity: input.quantity,
        destination: '공급사 발주',
        currentStage: 'EOS_FORECASTED',
        status: 'active',
        actor: input.actor,
        sourceChannel: input.sourceChannel,
        createdAt: now,
        updatedAt: now,
        idempotencyKey: `${taskId}:${now}`,
        ticksInCurrentStage: 0,
        ticksTarget: EOS_WORK_NODE_TICKS,
        receiveNodeKey: getInitialEosStageWorkNodeKey('EOS_FORECASTED'),
        simulationGlobalFailureRate: simulationSettings.globalFailureRate,
        simulationStageOverrides: { ...simulationSettings.stageOverrides },
    };
}

async function persistTask(task) {
    await createTask(task);
    const routingKey = 'eos.forecast.completed';
    await appendEvent({
        eventId: generateUUID(),
        eventType: routingKey,
        routingKey,
        aggregateId: task.taskId,
        payload: {
            owner: task.owner,
            itemCode: task.itemCode,
            quantity: task.quantity,
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

export async function createEosTask(input = {}) {
    const normalized = normalizeInput(input, input.sourceChannel ?? 'auto');
    const task = await buildEosTask(normalized);
    await persistTask(task);
    dtag(2, ['logistics', 'eos', 'event'], 'EOS 자동발주 진입 — 재고 임계 트리거 검증과 PO 발행 흐름 진입 블록', task.taskId);
    dlog(1, `eosSimulation.createEosTask — ${normalized.sourceChannel} 경로 EOS 진입`, task.taskId);
    dlog(2, 'eosSimulation.createEosTask — 재고 임계 감지 이벤트 트리거와 실 ROP 평가 엔진 연결 지점', task.taskId);
    return task;
}

export async function createRandomEosTask(source = 'auto') {
    return createEosTask({ sourceChannel: source });
}

async function scheduleNextAutoEos() {
    if (!autoRunning) return;

    autoTimerId = window.setTimeout(async () => {
        try {
            await createRandomEosTask('auto');
        } finally {
            scheduleNextAutoEos();
        }
    }, randomDelay(AUTO_MIN_MS, AUTO_MAX_MS));
}

export function startAutoEosTasks() {
    if (autoRunning) return;
    autoRunning = true;
    void (async () => {
        try {
            await createRandomEosTask('auto');
        } finally {
            if (autoRunning) scheduleNextAutoEos();
        }
    })();
}

export function stopAutoEosTasks() {
    autoRunning = false;
    if (autoTimerId !== null) {
        window.clearTimeout(autoTimerId);
        autoTimerId = null;
    }
}
