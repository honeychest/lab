import { useState } from 'react';
import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { setFocus } from '@/store/focusStore';
import SupportFlowStrip from '../components/SupportFlowStrip';
import NodeTaskPopover from '../components/NodeTaskPopover';
import { EOS_SUPPORT_FLOWS } from '../constants';
import EosStageGrid from '../components/tabs/eos/EosStageGrid';

export default function EosTab({ onInfoOpen }) {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();
    const [taskPopover, setTaskPopover] = useState(null);

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

    return (
        <section className="logistics-tab-shell logistics-stage-tab-shell">
            <SupportFlowStrip title="EOS 흐름" flows={EOS_SUPPORT_FLOWS} onInfoOpen={onInfoOpen} />

            <EosStageGrid
                tasks={tasks}
                focusedTaskId={focusedTaskId}
                onPopover={openNodeTaskPopover}
            />

            {taskPopover && (
                <NodeTaskPopover
                    taskPopover={taskPopover}
                    focusedTaskId={focusedTaskId}
                    onClose={() => setTaskPopover(null)}
                    renderPrimary={task => task.taskId}
                    renderMeta={task => task.itemCode}
                />
            )}
        </section>
    );
}
