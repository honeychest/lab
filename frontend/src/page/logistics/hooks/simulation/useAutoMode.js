import { useState } from 'react';
import { dlog } from '@/global/chs';
import { startAutoOmsOrders, stopAutoOmsOrders } from '../../services/omsSimulation';

export default function useAutoMode() {
    const [autoMode, setAutoMode] = useState(false);

    const handleAutoToggle = () => {
        const next = !autoMode;
        setAutoMode(next);
        if (next) {
            startAutoOmsOrders();
            dlog(1, 'LogisticsLayout.autoToggle — Auto 시작. OMS 접수 자동 생성 활성화 (REQ-T2-032)');
        } else {
            stopAutoOmsOrders();
            dlog(1, 'LogisticsLayout.autoToggle — Auto 정지. 신규 주문 생성만 중단, 진행 중 Task는 계속 진행');
        }
    };

    return {
        autoMode,
        setAutoMode,
        handleAutoToggle,
    };
}
