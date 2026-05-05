import { useState } from 'react';

export default function useSettingsPanel() {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [infoOverlay, setInfoOverlay] = useState(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const handleSettingsOpen = () => {
        setSettingsOpen(true);
    };

    const handleSettingsClose = () => {
        setSettingsOpen(false);
    };

    const handleInfoOverlayOpen = (payload) => {
        setInfoOverlay(payload);
    };

    const handleInfoOverlayClose = () => {
        setInfoOverlay(null);
    };

    const toggleAdvanced = () => {
        setAdvancedOpen(open => !open);
    };

    return {
        settingsOpen,
        setSettingsOpen,
        handleSettingsOpen,
        handleSettingsClose,
        infoOverlay,
        setInfoOverlay,
        handleInfoOverlayOpen,
        handleInfoOverlayClose,
        advancedOpen,
        setAdvancedOpen,
        toggleAdvanced,
    };
}
