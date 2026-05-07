import { useEffect, useState } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import {
    createBulkOmsOrders,
    createOmsTask,
    OWNER_OPTIONS,
    ITEM_OPTIONS,
    DESTINATION_OPTIONS,
} from '../services/omsSimulation';
import { dlog, dtag } from '@/global/chs';
import { setFocus } from '@/store/focusStore';
import SupportFlowStrip from '../components/SupportFlowStrip';
import NodeTaskPopover from '../components/NodeTaskPopover';
import OmsCreateModal from '../components/OmsCreateModal';
import { OWNER_KEY, OMS_SUPPORT_FLOWS } from '../constants';
import OmsBulkProgress from '../components/tabs/oms/OmsBulkProgress';
import OmsStageGrid from '../components/tabs/oms/OmsStageGrid';

function defaultForm(owner) {
    return {
        owner,
        itemCode: ITEM_OPTIONS[0],
        quantity: 3,
        destination: DESTINATION_OPTIONS[0],
    };
}

export default function OmsTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();
    const [bulkProgress, setBulkProgress] = useState({ active: false, current: 0, total: 20 });
    const [selectedOwner, setSelectedOwner] = useState(() => window.localStorage.getItem(OWNER_KEY) ?? OWNER_OPTIONS[0]);
    const [form, setForm] = useState(() => defaultForm(window.localStorage.getItem(OWNER_KEY) ?? OWNER_OPTIONS[0]));
    const [modalMode, setModalMode] = useState(null);
    const [taskPopover, setTaskPopover] = useState(null);

    useEffect(() => {
        window.localStorage.setItem(OWNER_KEY, selectedOwner);
    }, [selectedOwner]);

    useEffect(() => {
        setForm(current => ({ ...current, owner: selectedOwner }));
    }, [selectedOwner]);

    useEffect(() => {
        dlog(2, 'OmsTab — 화주 Portal 시점 토글 UI는 현재 숨김. co/후속 단계에서 범위 재승인 시 노출 검토 (REQ-T2-004 [pu])');
    }, []);

    const handleSubmit = async () => {
        if (!modalMode) return;
        const inbound = modalMode === 'inbound';
        dtag(2, ['logistics', 'oms', 'ui', 'validation'], 'OMS UI 진입 관문에서 단건/입고 등록 디스패치 블록');
        await createOmsTask({
            ...form,
            inbound,
            sourceChannel: 'operator',
            ownerView: false,
        });
        if (inbound) {
            dlog(1, 'OmsTab.handleInboundCreate — 입고 예약/등록 실행');
            dlog(2, 'OmsTab.handleInboundCreate — co에서 OMS 단일 진입 관문 검증/입고 이벤트 브로커 교체 지점 (REQ-T2-013 [pu])', form.owner);
        } else {
            dlog(1, 'OmsTab.handleSingleCreate — 단건 등록 실행');
        }
        setModalMode(null);
    };

    const handleBulkCreate = async () => {
        if (bulkProgress.active) return;
        setBulkProgress({ active: true, current: 0, total: 20 });

        try {
            await createBulkOmsOrders((current, total) => {
                setBulkProgress({ active: true, current, total });
            });
        } finally {
            setBulkProgress(progress => ({ ...progress, active: false }));
        }
    };

    const openNodeTaskPopover = (event, stage, node, status, nodeTasks) => {
        event.stopPropagation();
        const filteredTasks = status === 'all'
            ? nodeTasks
            : nodeTasks.filter(task => task.status === status);
        if (filteredTasks.length === 0) return;
        if (filteredTasks.length === 1) {
            setFocus(filteredTasks[0].taskId);
            return;
        }
        setTaskPopover({
            stage,
            nodeKey: node.key,
            nodeLabel: node.label,
            status,
            tasks: filteredTasks,
        });
    };

    const omsFlows = [
        {
            key: 'oms-create-order',
            label: '오더 등록',
            meta: '단건 주문 생성',
            variant: 'action',
            onClick: () => setModalMode('order'),
        },
        {
            key: 'oms-create-inbound',
            label: '입고 계약',
            meta: '입고 요청 생성',
            variant: 'action',
            onClick: () => setModalMode('inbound'),
        },
        {
            key: 'oms-create-bulk',
            label: bulkProgress.active ? `투입 중 ${bulkProgress.current}/${bulkProgress.total}` : '일괄 등록 20건',
            meta: '대량 주문 투입',
            variant: 'action',
            disabled: bulkProgress.active,
            onClick: handleBulkCreate,
        },
        ...OMS_SUPPORT_FLOWS,
    ];

    return (
            <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip title="OMS 흐름" flows={omsFlows} onInfoOpen={onInfoOpen} />

            <OmsBulkProgress progress={bulkProgress} />

            <OmsStageGrid
                tasks={tasks}
                focusedTaskId={focusedTaskId}
                onPopover={openNodeTaskPopover}
            />

            {taskPopover && (
                <NodeTaskPopover
                    taskPopover={taskPopover}
                    focusedTaskId={focusedTaskId}
                    onClose={() => setTaskPopover(null)}
                />
            )}

            {modalMode && (
                <OmsCreateModal
                    mode={modalMode}
                    form={form}
                    selectedOwner={selectedOwner}
                    onOwnerChange={setSelectedOwner}
                    onFormChange={setForm}
                    onSubmit={handleSubmit}
                    onClose={() => setModalMode(null)}
                />
            )}
        </section>
    );
}
