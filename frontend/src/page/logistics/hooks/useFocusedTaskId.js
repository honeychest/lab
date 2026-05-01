import { useEffect, useState } from 'react';
import { emitter } from '@/domain/logistics/common/emitter';
import { getFocusedTaskId } from '@/store/focusStore';

export default function useFocusedTaskId() {
    const [focusedTaskId, setFocusedTaskId] = useState(() => getFocusedTaskId());

    useEffect(() => {
        const onFocusChanged = ({ taskId }) => setFocusedTaskId(taskId);
        emitter.on('logistics:focus:changed', onFocusChanged);
        return () => emitter.off('logistics:focus:changed', onFocusChanged);
    }, []);

    return focusedTaskId;
}
