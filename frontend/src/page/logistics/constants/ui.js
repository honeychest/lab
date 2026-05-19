// UI 관련 상수

import OverviewTab from '../tabs/OverviewTab';
import EosTab from '../tabs/EosTab';
import OmsTab from '../tabs/OmsTab';
import WmsTab from '../tabs/WmsTab';
import QmsTab from '../tabs/QmsTab';
import TmsTab from '../tabs/TmsTab';
import ListTab from '../tabs/ListTab';

export const TAB_STORAGE_KEY = 'logistics.activeTab';
export const DESKTOP_VIEW_STORAGE_KEY = 'logistics.desktopView';

export const TAB_MAP = {
    overview: OverviewTab,
    eos:      EosTab,
    oms:      OmsTab,
    wms:      WmsTab,
    qms:      QmsTab,
    tms:      TmsTab,
    list:     ListTab,
};

// 탭 컴포넌트 export (LogisticsLayout에서 필요)
export { OverviewTab };
