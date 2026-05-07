import { useState, useEffect } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { setFocus } from '@/store/focusStore';
import { dlog } from '@/global/chs';
import SupportFlowStrip from '../components/SupportFlowStrip';
import NodeTaskPopover from '../components/NodeTaskPopover';
import { WMS_SUPPORT_FLOWS } from '../constants';
import WmsStageGrid from '../components/tabs/wms/WmsStageGrid';

export default function WmsTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();
    const [taskPopover, setTaskPopover] = useState(null);

    useEffect(() => {
        dlog(1, 'WmsTab — OMS 참조 단일 레인 work-node 방식 (7단 세로 배치)');
        dlog(2, 'WmsTab — Inbound 5단은 보조 흐름 팝업으로 축소, 상세 구현은 dlog/dtag로 후속 회수');
    }, []);

    const openNodeTaskPopover = (event, stage, node, status, nodeTasks) => {
        event.stopPropagation();
        const filtered = status === 'all' ? nodeTasks : nodeTasks.filter(t => t.status === status);
        if (filtered.length === 0) return;
        if (filtered.length === 1) {
            setFocus(filtered[0].taskId);
            return;
        }
        setTaskPopover({
            stage,
            nodeKey: node.key,
            nodeLabel: node.label,
            status,
            tasks: filtered,
        });
    };


    return (
        <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip title="WMS 흐름" flows={WMS_SUPPORT_FLOWS} onInfoOpen={onInfoOpen} />

            <WmsStageGrid
                tasks={tasks}
                focusedTaskId={focusedTaskId}
                onPopover={openNodeTaskPopover}
            />

            {taskPopover && (
                <NodeTaskPopover
                    taskPopover={taskPopover}
                    focusedTaskId={focusedTaskId}
                    onClose={() => setTaskPopover(null)}
                    renderPrimary={task => `${task.owner} · ${task.itemCode}`}
                    renderMeta={task => task.boxId ?? task.zoneId ?? '-'}
                />
            )}
        </section>
    );
}
