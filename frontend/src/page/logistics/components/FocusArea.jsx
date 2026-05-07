import { useState, useEffect } from 'react';
import { dlog } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getTaskById } from '@/store/taskStore';
import { getEventCount, getEventsByAggregate } from '@/store/eventStore';
import { performRecoveryAction, performBranchInject } from '../services/recoveryActions';
import FocusWorkPanel, { EmptyFocusWorkPanel } from './focus/FocusWorkPanel';

export default function FocusArea({ onInfoOpen }) {
    const [focusedTask, setFocusedTask] = useState(null);
    const [history, setHistory] = useState([]);
    const [eventCount, setEventCount] = useState(0);
    const focusedTaskId = focusedTask?.taskId ?? null;
    const focusedTaskStage = focusedTask?.currentStage ?? null;

    useEffect(() => {
        const refreshEventCount = async () => {
            setEventCount(await getEventCount());
        };
        void refreshEventCount();

        emitter.on('logistics:event', refreshEventCount);
        emitter.on('logistics:retention:cleared', refreshEventCount);
        return () => {
            emitter.off('logistics:event', refreshEventCount);
            emitter.off('logistics:retention:cleared', refreshEventCount);
        };
    }, []);

    useEffect(() => {
        const refresh = async (taskId) => {
            if (!taskId) {
                setFocusedTask(null);
                setHistory([]);
                return;
            }
            const [task, events] = await Promise.all([
                getTaskById(taskId),
                getEventsByAggregate(taskId),
            ]);
            setFocusedTask(task ?? null);
            setHistory(events);
        };

        const onFocusChanged = async ({ taskId }) => {
            await refresh(taskId);
        };
        const onTaskUpdated = async ({ taskId }) => {
            if (focusedTaskId === taskId) {
                await refresh(taskId);
            }
        };
        const onEventLogged = async (event) => {
            if (focusedTaskId && event.aggregateId === focusedTaskId) {
                await refresh(focusedTaskId);
            }
        };
        emitter.on('logistics:focus:changed', onFocusChanged);
        emitter.on('logistics:task:updated', onTaskUpdated);
        emitter.on('logistics:event', onEventLogged);
        return () => {
            emitter.off('logistics:focus:changed', onFocusChanged);
            emitter.off('logistics:task:updated', onTaskUpdated);
            emitter.off('logistics:event', onEventLogged);
        };
    }, [focusedTaskId]);

    useEffect(() => {
        if (!focusedTaskId) return;
        dlog(1, 'FocusArea redesign: Current Stage now uses selected task detail and exception handling panel.');
    }, [focusedTaskId, focusedTaskStage]);

    if (!focusedTask) {
        return (
            <EmptyFocusWorkPanel
                eventCount={eventCount}
                onInfoOpen={onInfoOpen}
            />
        );
    }

    const handleWorkAction = async (action) => {
        await performRecoveryAction(focusedTask, action);
    };

    const handleBranchInject = async (failureCode) => {
        await performBranchInject(focusedTask, failureCode);
    };

    return (
        <FocusWorkPanel
            task={focusedTask}
            history={history}
            eventCount={eventCount}
            onInfoOpen={onInfoOpen}
            onWorkAction={handleWorkAction}
            onBranchInject={handleBranchInject}
        />
    );
}
