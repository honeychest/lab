import SettingsOverlay from '../SettingsOverlay';
import LogOverlay from '../LogOverlay';

export default function LogisticsOverlays({
    settingsOpen,
    settingsProps,
    logOpen,
    logProps,
}) {
    return (
        <>
            {settingsOpen && <SettingsOverlay {...settingsProps} />}
            {logOpen && <LogOverlay {...logProps} />}
        </>
    );
}
