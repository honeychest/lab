import { useState } from 'react';

export default function usePanelState() {
    const [rightPanelOpen, setRightPanel] = useState(true);

    const toggleRightPanel = () => setRightPanel(p => !p);

    return {
        rightPanelOpen,
        setRightPanel,
        toggleRightPanel,
    };
}
