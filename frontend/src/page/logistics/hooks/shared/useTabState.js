import { useState, useEffect } from 'react';

export default function useTabState() {
    const TAB_STORAGE_KEY = 'logistics.activeTab';

    const [activeTab, setActiveTab] = useState(() =>
        localStorage.getItem(TAB_STORAGE_KEY) ?? 'overview'
    );

    useEffect(() => {
        localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }, [activeTab]);

    return {
        activeTab,
        setActiveTab,
    };
}
