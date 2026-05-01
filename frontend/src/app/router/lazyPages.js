import { lazy } from 'react';

export const loadSignalPage = () => import('../../page/signal/SignalPage.jsx');

export const SignalPage = lazy(loadSignalPage);

let signalPagePreloadPromise = null;

export function preloadSignalPage() {
    if (!signalPagePreloadPromise) {
        signalPagePreloadPromise = loadSignalPage();
    }
    return signalPagePreloadPromise;
}
