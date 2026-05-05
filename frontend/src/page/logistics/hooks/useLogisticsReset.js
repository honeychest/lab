import { dlog, dtag } from '@/global/chs';
import { clearAllTasks } from '@/store/taskStore';
import { clearEventStore } from '@/store/eventStore';
import { appendAuditEvent } from '@/store/auditStore';
import { resetFocusState } from '@/store/focusStore';
import { stopAutoOmsOrders } from '../services/omsSimulation';
import { TAB_STORAGE_KEY } from '../constants';

export default function useLogisticsReset({
    setActiveTab,
    setAutoMode,
    closeSettings,
}) {
    const handleProgressReset = async () => {
        dtag(2, ['logistics', 'reset', 'event'], '진행 데이터 리셋과 이벤트 저장소 초기화 블록');
        stopAutoOmsOrders();
        setAutoMode(false);
        await appendAuditEvent('audit.reset.performed', {
            scope: 'partial',
        }, {
            aggregateId: 'dashboard',
            actor: 'operator',
        });
        await clearAllTasks();
        await clearEventStore();
        resetFocusState();
        dlog(1, 'LogisticsLayout.resetProgress — 진행 데이터 리셋 완료');
        dlog(2, 'LogisticsLayout.resetProgress — co에서 진행 데이터 초기화 audit/event 저장 지점 (REQ-T2-055/049 [pu→co])');
        closeSettings();
    };

    const handleFullReset = async () => {
        dtag(2, ['logistics', 'reset', 'audit'], '전체 초기화 확인 절차와 감사 로그 연결 블록');
        stopAutoOmsOrders();
        setAutoMode(false);
        localStorage.removeItem(TAB_STORAGE_KEY);
        setActiveTab('overview');
        await appendAuditEvent('audit.reset.performed', {
            scope: 'full',
        }, {
            aggregateId: 'dashboard',
            actor: 'operator',
        });
        await clearAllTasks();
        await clearEventStore();
        resetFocusState();
        dlog(1, 'LogisticsLayout.resetAll — 완전 초기화 완료. 시드/설정 복원은 L3 구현');
        dlog(2, 'LogisticsLayout.resetAll — co에서 RESET 확인 절차와 전체 초기화 감사 로그 연결 지점 (REQ-T2-055 [pu→co])');
        closeSettings();
    };

    return {
        handleProgressReset,
        handleFullReset,
    };
}
