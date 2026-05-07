import { useState, useEffect } from 'react';
import { dlog, dtag } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getTaskById, updateTaskStatus } from '@/store/taskStore';
import { getEventsByAggregate } from '@/store/eventStore';
import { pauseTask, resumeTask } from '@/scheduler/tickLoop';
import { appendAuditEvent } from '@/store/auditStore';
import { performBranchInject, performRecoveryAction } from '../services/recoveryActions';
import RightPanelContent from './side/RightPanelContent';

export default function RightPanel({ open, onToggle, onInfoOpen, onLogOpen }) {
    const [task, setTask] = useState(null);
    const [history, setHistory] = useState([]);

    const refresh = async (taskId) => {
        if (!taskId) { setTask(null); setHistory([]); return; }
        const t = await getTaskById(taskId);
        setTask(t ?? null);
        if (t) {
            const events = await getEventsByAggregate(taskId);
            setHistory(events.slice(-20).reverse());
        }
    };

    useEffect(() => {
        const onFocus = ({ taskId }) => refresh(taskId);
        const onUpdate = ({ taskId }) => { if (task?.taskId === taskId) refresh(taskId); };
        emitter.on('logistics:focus:changed', onFocus);
        emitter.on('logistics:task:updated', onUpdate);
        return () => {
            emitter.off('logistics:focus:changed', onFocus);
            emitter.off('logistics:task:updated', onUpdate);
        };
    }, [task?.taskId]);

    useEffect(() => {
        if (task?.status !== 'failed') return;
        dtag(2, ['logistics', 'ops', 'recovery', 'exception'], '실패 작업 선택 후 운영자 조치 버튼 매핑 블록', task?.taskId);
        dlog(1, 'RightPanel.조치 — 실패 유형별 조치 버튼 (REQ-260) — L2 매트릭스 구현');
        dlog(2, 'RightPanel.조치 — co에서 실패 유형별 조치 매핑 테이블/감사 로그 확장 지점 (REQ-T2-002/007/008/020 [pu→co])', task?.taskId);
    }, [task?.taskId, task?.status]);

    const handlePause = async () => {
        if (!task) return;
        dtag(2, ['logistics', 'ops', 'audit'], '운영자 일시정지/재개 감사 로그와 중단 시점 복원 블록', task.taskId);
        if (task.status === 'paused') {
            resumeTask(task.taskId);
            updateTaskStatus(task.taskId, 'active');
        } else {
            pauseTask(task.taskId);
            updateTaskStatus(task.taskId, 'paused');
        }
        await appendAuditEvent('audit.pause.toggled', {
            status: task.status === 'paused' ? 'active' : 'paused',
            stage: task.currentStage,
        }, {
            aggregateId: task.taskId,
            correlationId: task.correlationId,
            actor: 'operator',
        });
        dlog(1, 'RightPanel.pause — 일시정지/재개 토글 (REQ-T2-037 [pu→co])');
        dlog(2, 'RightPanel.pause — co에서 운영자 일시정지 audit.* 이벤트와 중단 시점 복원 규칙 연결 지점 (REQ-T2-037/049 [pu→co])', task.taskId);
    };

    const handleCancel = () => {
        if (!task) return;
        onInfoOpen?.({
            title: '취소',
            summary: '현재 위치를 지운 뒤 되돌리는 방식이 아니라, 현재 단계에 취소 상태를 남기는 흐름입니다.',
            bullets: [
                '운영자 확인 후 cancelled 전이',
                '취소 사유 입력 UI는 아직 미연결',
                '이력 체인과 전체 로그에는 취소 상태를 남길 구조',
            ],
        });
    };

    const handleBranchInject = async (type) => {
        if (!task) return;
        await performBranchInject(task, type);
        await refresh(task.taskId);
    };

    const handleRecoveryAction = async (action) => {
        if (!task) return;
        await performRecoveryAction(task, action);
        await refresh(task.taskId);
    };

    const handleLogOpen = () => {
        onLogOpen?.();
    };

    return (
        <aside className={`logistics-side-panel${open ? '' : ' closed'}`}>
            <div className="logistics-side-stack">
                <button className="logistics-panel-toggle" onClick={onToggle}>
                    {open ? '▶' : '◀'}
                </button>

                <div className="logistics-side-scroll">
                    <RightPanelContent
                        task={task}
                        history={history}
                        onPause={handlePause}
                        onCancel={handleCancel}
                        onLogOpen={handleLogOpen}
                        onBranchInject={handleBranchInject}
                        onRecoveryAction={handleRecoveryAction}
                    />
                </div>
            </div>
        </aside>
    );
}
