import { useState, useEffect } from 'react';
import { dlog } from '@/global/chs';
import { startAutoOmsOrders, stopAutoOmsOrders } from '../../services/omsSimulation';
import { startAutoEosTasks, stopAutoEosTasks } from '../../services/eosSimulation';
import { isTickLoopRunning, resumeIfNeeded, startTickLoop, stopTickLoop } from '@/scheduler/tickLoop';

export default function useAutoMode() {
    const [autoMode, setAutoMode] = useState(false);
    const [simRunning, setSimRunning] = useState(isTickLoopRunning());

    useEffect(() => {
        resumeIfNeeded().then(resumed => {
            if (resumed) setSimRunning(true);
        });
    }, []);

    const startSimulation = () => {
        startTickLoop();
        setSimRunning(true);
        dlog(1, 'LogisticsLayout.simulationStart — 시뮬레이션 시작. Tick Loop 활성화');
    };

    const stopAutoMode = () => {
        stopAutoOmsOrders();
        stopAutoEosTasks();
        setAutoMode(false);
        dlog(1, 'LogisticsLayout.autoToggle — 자동주문 정지. 신규 OMS·EOS 생성만 중단, 진행 중 Task는 계속 진행');
    };

    const stopSimulation = () => {
        stopTickLoop();
        stopAutoMode();
        setSimRunning(false);
        dlog(1, 'LogisticsLayout.simulationStop — 시뮬레이션 정지. Tick Loop 및 자동주문 중단');
    };

    const handleAutoToggle = () => {
        if (autoMode) {
            stopAutoMode();
            return;
        }

        if (!simRunning) startSimulation();
        startAutoOmsOrders();
        startAutoEosTasks();
        setAutoMode(true);
        dlog(1, 'LogisticsLayout.autoToggle — 자동주문 시작. OMS·EOS 자동 생성 활성화 (REQ-T2-032)');
    };

    const resetModes = () => {
        if (simRunning || autoMode) {
            stopSimulation();
            return;
        }

        stopTickLoop();
        stopAutoOmsOrders();
        stopAutoEosTasks();
    };

    return {
        autoMode,
        handleAutoToggle,
        resetModes,
    };
}
