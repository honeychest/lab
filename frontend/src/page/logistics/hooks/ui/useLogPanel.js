import { useState, useEffect, useCallback } from 'react';
import { emitter } from '@/domain/logistics/common/emitter';
import { getAllEvents } from '@/store/eventStore';
import { getFocusedTaskId } from '@/store/focusStore';

export default function useLogPanel() {
    const [logOpen, setLogOpen] = useState(false);
    const [logScope, setLogScope] = useState('focus');
    const [logSnapshot, setLogSnapshot] = useState({ events: [], focusedTaskId: null });

    const refreshLogSnapshot = useCallback(async () => {
        const [events] = await Promise.all([
            getAllEvents(),
        ]);

        setLogSnapshot({
            events,
            focusedTaskId: getFocusedTaskId(),
        });
    }, []);

    useEffect(() => {
        if (!logOpen) return undefined;

        const initialRefreshTimer = window.setTimeout(() => {
            void refreshLogSnapshot();
        }, 0);

        const onLogChanged = () => refreshLogSnapshot();
        const onFocusChanged = ({ taskId }) => {
            setLogSnapshot(current => ({ ...current, focusedTaskId: taskId ?? null }));
        };

        emitter.on('logistics:event', onLogChanged);
        emitter.on('logistics:focus:changed', onFocusChanged);
        emitter.on('logistics:retention:cleared', onLogChanged);

        return () => {
            window.clearTimeout(initialRefreshTimer);
            emitter.off('logistics:event', onLogChanged);
            emitter.off('logistics:focus:changed', onFocusChanged);
            emitter.off('logistics:retention:cleared', onLogChanged);
        };
    }, [logOpen, refreshLogSnapshot]);

    return {
        logOpen,
        setLogOpen,
        logScope,
        setLogScope,
        logSnapshot,
        setLogSnapshot,
    };
}
