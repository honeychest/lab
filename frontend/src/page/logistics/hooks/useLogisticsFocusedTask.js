import { useEffect, useMemo, useState } from 'react';
import { emitter } from '@/domain/logistics/common/emitter';
import { getAllEvents } from '@/store/eventStore';
import { getFocusedTaskId, setFocus } from '@/store/focusStore';

export default function useLogisticsFocusedTask(tasks) {
    const [focusedTaskId, setFocusedTaskId] = useState(() => getFocusedTaskId());
    const [events, setEvents] = useState([]);

    useEffect(() => {
        const refreshEvents = async () => {
            setEvents(await getAllEvents());
        };
        const handleFocusChanged = ({ taskId }) => setFocusedTaskId(taskId ?? null);

        void refreshEvents();
        emitter.on('logistics:event', refreshEvents);
        emitter.on('logistics:retention:cleared', refreshEvents);
        emitter.on('logistics:focus:changed', handleFocusChanged);

        return () => {
            emitter.off('logistics:event', refreshEvents);
            emitter.off('logistics:retention:cleared', refreshEvents);
            emitter.off('logistics:focus:changed', handleFocusChanged);
        };
    }, []);

    const focusedTask = useMemo(
        () => tasks.find(task => task.taskId === focusedTaskId) ?? null,
        [focusedTaskId, tasks]
    );

    const latestFocusedEvent = useMemo(() => {
        if (!focusedTaskId) return null;
        return [...events].reverse().find(event => event.aggregateId === focusedTaskId) ?? null;
    }, [events, focusedTaskId]);

    const selectTask = (task) => {
        if (!task?.taskId) return;
        setFocus(task.taskId);
    };

    const selectEventTask = (event) => {
        if (!event?.aggregateId) return;
        setFocus(event.aggregateId);
    };

    return {
        focusedTask,
        latestFocusedEvent,
        selectTask,
        selectEventTask,
    };
}
