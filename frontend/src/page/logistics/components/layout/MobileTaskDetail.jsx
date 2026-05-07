import { STAGE_DOMAIN, getStageWorkNodes } from '@/domain/logistics/common/stages';
import { getFailureCandidatesForStage } from '@/domain/logistics/common/failures';
import { formatRelativeAge } from '../../utils/formatters';

function statusLabel(status) {
    if (status === 'active') return '진행중';
    if (status === 'paused') return '일시정지';
    if (status === 'completed') return '완료';
    if (status === 'failed') return '실패';
    if (status === 'cancelled') return '취소';
    return status ?? '미확인';
}

function actionsForTask(task) {
    if (task.status === 'failed') return task.failureActions ?? [];

    return getFailureCandidatesForStage(task.currentStage, task.receiveNodeKey).map(failure => ({
        id: failure.code,
        label: failure.label,
        failureCode: failure.code,
    }));
}

export default function MobileTaskDetail({ task, latestEvent, onRecoveryAction, onBranchInject }) {
    if (!task) {
        return (
            <section className="logistics-mobile-detail is-empty">
                <div className="logistics-mobile-detail-head">
                    <h2>선택 작업</h2>
                </div>
                <p>오더, 진행중, 실패, 전체 로그 목록에서 작업을 선택하세요.</p>
            </section>
        );
    }

    const domain = STAGE_DOMAIN[task.currentStage] || 'SYS';
    const nodeLabel = getStageWorkNodes(task.currentStage).find(node => node.key === task.receiveNodeKey)?.label
        ?? task.receiveNodeKey
        ?? task.currentStage;
    const actions = actionsForTask(task);

    return (
        <section className={`logistics-mobile-detail status-${task.status}`}>
            <div className="logistics-mobile-detail-head">
                <h2>선택 작업</h2>
                <span>{statusLabel(task.status)}</span>
            </div>
            <strong className="logistics-mobile-task-id">{task.taskId}</strong>
            <div className="logistics-mobile-detail-grid">
                <div>
                    <span>대상</span>
                    <strong>{task.owner || '미지정'} · {task.itemCode || '-'}</strong>
                </div>
                <div>
                    <span>세부 단계</span>
                    <strong>{domain} · {nodeLabel}</strong>
                </div>
            </div>
            {task.status === 'failed' && (
                <div className="logistics-mobile-failure">
                    <span>실패 정보</span>
                    <strong>{task.failureCode || task.failureLabel || '실패 코드 없음'}</strong>
                    {task.failureLabel && <p>{task.failureLabel}</p>}
                </div>
            )}
            <div className="logistics-mobile-latest">
                <span>최근 이벤트</span>
                <strong>{latestEvent?.routingKey || '이벤트 없음'}</strong>
                <p>{latestEvent ? formatRelativeAge(latestEvent.timestamp) : '선택 작업의 이벤트를 기다리는 중'}</p>
            </div>
            <div className="logistics-mobile-actions-panel">
                <span>{task.status === 'failed' ? '조치' : '오류주입'}</span>
                {actions.length > 0 ? (
                    <div>
                        {actions.map(action => (
                            <button
                                key={action.id}
                                type="button"
                                onClick={() => {
                                    if (task.status === 'failed') {
                                        onRecoveryAction(action);
                                    } else {
                                        onBranchInject(action.failureCode);
                                    }
                                }}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p>{task.status === 'failed' ? '등록된 복구 조치가 없습니다.' : '현재 세부 단계에 등록된 예외 조치가 없습니다.'}</p>
                )}
            </div>
        </section>
    );
}
