import { useState, useEffect, useMemo } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { setFocus } from '@/store/focusStore';
import { dlog } from '@/global/chs';
import { INBOUND_STAGES } from '@/domain/logistics/common/stages';
import SupportFlowStrip from '../components/SupportFlowStrip';
import NodeTaskPopover from '../components/NodeTaskPopover';
import { WMS_SUPPORT_FLOWS } from '../constants';
import WmsStageGrid from '../components/tabs/wms/WmsStageGrid';
import InboundStageGrid from '../components/tabs/wms/InboundStageGrid';

const INBOUND_STAGE_SET = new Set(INBOUND_STAGES);

export default function WmsTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();
    const [taskPopover, setTaskPopover] = useState(null);

    useEffect(() => {
        dlog(1, 'WmsTab — OMS 참조 단일 레인 work-node 방식 (7단 세로 배치)');
        dlog(2, 'WmsTab — focused task가 INBOUND 단계면 입고 grid로 자동 swap');
    }, []);

    const focusedTask = useMemo(
        () => (focusedTaskId ? tasks.find(t => t.taskId === focusedTaskId) : null),
        [tasks, focusedTaskId],
    );

    const mode = focusedTask && INBOUND_STAGE_SET.has(focusedTask.currentStage) ? 'inbound' : 'outbound';

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
            <div className={`logistics-wms-mode-badge logistics-wms-mode-badge--${mode}`} aria-live="polite">
                <span className="logistics-wms-mode-badge-dot" />
                <span className="logistics-wms-mode-badge-text">
                    {mode === 'inbound' ? 'WMS · 입고' : 'WMS · 출고'}
                </span>
                {mode === 'inbound' && focusedTask && (
                    <span className="logistics-wms-mode-badge-ref">{focusedTask.taskId}</span>
                )}
            </div>

            <SupportFlowStrip title="WMS 흐름" flows={WMS_SUPPORT_FLOWS} onInfoOpen={onInfoOpen} />

            <div key={mode} className="logistics-wms-grid-swap">
                {mode === 'inbound' ? (
                    <InboundStageGrid
                        tasks={tasks}
                        focusedTaskId={focusedTaskId}
                        onPopover={openNodeTaskPopover}
                    />
                ) : (
                    <WmsStageGrid
                        tasks={tasks}
                        focusedTaskId={focusedTaskId}
                        onPopover={openNodeTaskPopover}
                    />
                )}
            </div>

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
