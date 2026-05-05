import { useState, useEffect } from 'react';
import { dlog, dtag } from '@/global/chs';
import { emitter } from '@/domain/logistics/common/emitter';
import { getTaskById, updateTaskStatus } from '@/store/taskStore';
import { getEventsByAggregate } from '@/store/eventStore';
import { pauseTask, resumeTask } from '@/scheduler/tickLoop';
import { getOmsReceiveNodeLabel, STAGE_GUIDANCE, STAGE_LABELS } from '@/domain/logistics/common/stages';
import { getFailureCandidatesForStage } from '@/domain/logistics/common/failures';
import { appendAuditEvent } from '@/store/auditStore';
import { performBranchInject, performRecoveryAction } from '../services/recoveryActions';
import { CHAIN_BG, CHAIN_ICON } from '../constants';
import {
    historyEventLabel,
    isFailureEvent,
    historyRowType,
} from '../utils';

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

    const isFailed  = task?.status === 'failed';
    const isPaused  = task?.status === 'paused';
    const latestFailureEvent = history.find(isFailureEvent);
    const branchCandidates = task ? getFailureCandidatesForStage(task.currentStage, task.receiveNodeKey) : [];
    const currentStageGuidance = task ? STAGE_GUIDANCE[task.currentStage] : null;
    const receiveNodeLabel = task?.currentStage === 'OMS_RECEIVED' ? getOmsReceiveNodeLabel(task.receiveNodeKey) : null;

    return (
        <aside className={`logistics-side-panel${open ? '' : ' closed'}`}>
            <div className="logistics-side-stack">
                <button className="logistics-panel-toggle" onClick={onToggle}>
                    {open ? '▶' : '◀'}
                </button>

                <div className="logistics-side-scroll">
                {!task ? (
                    <div className="logistics-panel-empty">📭 포커스 작업 없음</div>
                ) : (
                    <>
                        <div className="logistics-side-section">
                            <div className="logistics-side-title">상세</div>
                            <div className="logistics-focus-id">{task.taskId}</div>
                            <div className="logistics-task-meta">
                                {task.owner} · {task.itemCode} · ▶ {task.destination}
                            </div>
                            {(task.zoneCode || task.vehicleId || task.boxId) && (
                                <div className="logistics-task-meta">
                                    {task.zoneCode ? `Zone ${task.zoneCode}` : ''}
                                    {task.zoneCode && task.zoneTemperature ? ` · ${task.zoneTemperature}` : ''}
                                    {task.vehicleId ? ` · ${task.vehicleId}` : ''}
                                    {task.boxId ? ` · ${task.boxId}` : ''}
                                </div>
                            )}
                            <div className="logistics-task-meta">
                                현재: {STAGE_LABELS[task.currentStage] ?? task.currentStage}
                                {receiveNodeLabel && ` · ${receiveNodeLabel}`}
                                {task.status === 'failed' && ` ❌ ${task.failureLabel ?? task.failureReason ?? ''}`}
                                {isPaused && ' ⏸'}
                            </div>
                            {currentStageGuidance && (
                                <div className="logistics-task-meta logistics-task-stage-summary">
                                    {currentStageGuidance.summary}
                                </div>
                            )}
                            {task.status === 'failed' && (
                                <div className="logistics-task-meta">
                                    {task.failureReason}
                                </div>
                            )}
                            {task.status !== 'failed' && latestFailureEvent && (
                                <div className="logistics-task-meta">
                                    최근 실패: {historyEventLabel(latestFailureEvent)}
                                </div>
                            )}
                            <div className="logistics-button-row">
                                <button className="logistics-secondary-btn" onClick={handlePause}>
                                    {isPaused ? '▶ 재개' : '⏸ 일시정지'}
                                </button>
                                <button className="logistics-danger-btn" onClick={handleCancel}>✕ 취소</button>
                                <button className="logistics-outline-btn" onClick={handleLogOpen}>🔍 로그 보기</button>
                            </div>
                        </div>

                        <div className="logistics-side-section">
                            {!isFailed ? (
                                <>
                                    <div className="logistics-side-title">분기 주입</div>
                                    <div className="logistics-action-grid">
                                        {branchCandidates.length > 0 ? branchCandidates.map(failure => (
                                            <button key={failure.code} className="logistics-outline-btn" onClick={() => handleBranchInject(failure.code)}>
                                                {failure.label}
                                            </button>
                                        )) : (
                                            <div className="logistics-empty-card" style={{ padding: '12px 14px' }}>
                                                이 단계에 등록된 실패 주입 후보가 없습니다.
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="logistics-side-title">조치 ({task.failureLabel ?? '실패'})</div>
                                    <div className="logistics-action-grid">
                                        {(task.failureActions ?? []).map(action => (
                                            <button
                                                key={action.id}
                                                className="logistics-success-btn"
                                                onClick={() => handleRecoveryAction(action)}
                                            >
                                                {action.label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="logistics-side-section grow">
                            <div className="logistics-side-title">이력 체인</div>
                            {history.length === 0 && <p className="logistics-task-meta">이력 없음</p>}
                            <div className="logistics-chain-list">
                            {history.map((ev, i) => {
                                const type = historyRowType(ev, i, task.status);
                                return (
                                    <div key={ev.eventId} className="logistics-chain-row" style={{ background: CHAIN_BG[type] ?? CHAIN_BG.pending }}>
                                        <span>{CHAIN_ICON[type]}</span>
                                        <span style={{ color: 'var(--dark-text-neutral)' }}>
                                            {new Date(ev.timestamp).toLocaleTimeString('ko-KR', { hour12: false })}
                                        </span>
                                        <span>{historyEventLabel(ev)}</span>
                                    </div>
                                );
                            })}
                            </div>
                        </div>
                    </>
                )}
                </div>
            </div>
        </aside>
    );
}
