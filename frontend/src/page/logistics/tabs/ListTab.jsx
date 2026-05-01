import useLogisticsSnapshot from '../hooks/useLogisticsSnapshot';
import useFocusedTaskId from '../hooks/useFocusedTaskId';
import { STAGE_LABELS } from '@/domain/logistics/common/stages';
import { setFocus } from '@/store/focusStore';

function elapsedText(task) {
    const elapsedMs = Math.max(0, Date.now() - task.createdAt);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function statusText(task) {
    if (task.status === 'completed' && task.currentStage === 'TMS_DELIVERED') return '인도 완료';
    if (task.status === 'completed') return '완료';
    if (task.status === 'failed') return '실패';
    if (task.status === 'paused') return '일시정지';
    return '진행 중';
}

export default function ListTab() {
    const { tasks } = useLogisticsSnapshot();
    const focusedTaskId = useFocusedTaskId();

    return (
        <section className="logistics-tab-shell">
            <div className="logistics-tab-header">
                <div>
                    <h2 className="logistics-tab-title">목록</h2>
                </div>
                <div className="logistics-tab-actions">
                    <span className="logistics-meta-pill">총 {tasks.length}건</span>
                </div>
            </div>

            <div className="logistics-list-shell">
                <table className="logistics-list-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>유형</th>
                            <th>화주</th>
                            <th>품목</th>
                            <th>현재 단계</th>
                            <th>상태</th>
                            <th>경과</th>
                            <th>포커스</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.length > 0 ? tasks.map(task => (
                            <tr
                                key={task.taskId}
                                className={focusedTaskId === task.taskId ? 'logistics-list-row focused' : 'logistics-list-row'}
                                onClick={() => setFocus(task.taskId)}
                            >
                                <td>{task.taskId}</td>
                                <td>{task.type === 'INBOUND' ? '입고' : '출고'}</td>
                                <td>{task.owner}</td>
                                <td>{task.itemCode}</td>
                                <td>{STAGE_LABELS[task.currentStage] ?? task.currentStage}</td>
                                <td>
                                    <span className={`logistics-status-chip ${task.status}`}>{statusText(task)}</span>
                                </td>
                                <td>{elapsedText(task)}</td>
                                <td>{focusedTaskId === task.taskId ? '선택됨' : '선택'}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={8}>
                                    <div className="logistics-empty-card" style={{ margin: '12px' }}>
                                        아직 표시할 task가 없습니다. 등록 또는 Auto 시작 후 전체 흐름을 여기서 시간순으로 확인할 수 있습니다.
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
