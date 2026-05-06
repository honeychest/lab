import { Fragment, useEffect, useState } from 'react';
import { emitter } from '@/domain/logistics/common/emitter';
import { getFocusedTaskId } from '@/store/focusStore';
import { getTaskById } from '@/store/taskStore';
import { INBOUND_STAGES, PIPELINE_STAGES, STAGE_DOMAIN, STAGE_LABELS } from '@/domain/logistics/common/stages';

const TABS = [
    { id: 'overview', label: '▣ 3축 개요' },
    { id: 'oms',      label: 'OMS' },
    { id: 'wms',      label: 'WMS' },
    { id: 'tms',      label: 'TMS' },
    { id: 'list',     label: '📋 목록' },
];

function getFocusStages(task) {
    return task?.type === 'INBOUND' ? INBOUND_STAGES : PIPELINE_STAGES;
}

function getRouteClusters(task, stages) {
    if (task?.type === 'INBOUND') {
        return [
            { key: 'OMS_GATE', label: 'OMS', stages: ['INBOUND_RECEIVED'] },
            { key: 'WMS_INBOUND', label: 'WMS', stages: stages.filter(stage => stage !== 'INBOUND_RECEIVED') },
            { key: 'COMPLETE', label: '완료', stages: ['__COMPLETE__'] },
        ];
    }

    return [
        { key: 'OMS', label: 'OMS', stages: stages.filter(stage => STAGE_DOMAIN[stage] === 'OMS') },
        { key: 'WMS', label: 'WMS', stages: stages.filter(stage => STAGE_DOMAIN[stage] === 'WMS') },
        { key: 'TMS', label: 'TMS', stages: stages.filter(stage => STAGE_DOMAIN[stage] === 'TMS') },
        { key: 'COMPLETE', label: '완료', stages: ['__COMPLETE__'] },
    ];
}

function FocusRouteSummary() {
    const [task, setTask] = useState(null);

    useEffect(() => {
        let alive = true;
        const refresh = async (taskId = getFocusedTaskId()) => {
            const focusedTask = taskId ? await getTaskById(taskId) : null;
            if (alive) setTask(focusedTask ?? null);
        };
        const onFocusChanged = ({ taskId }) => refresh(taskId);
        const onTaskUpdated = ({ taskId }) => {
            if (task?.taskId === taskId) refresh(taskId);
        };

        refresh();
        emitter.on('logistics:focus:changed', onFocusChanged);
        emitter.on('logistics:task:updated', onTaskUpdated);
        emitter.on('logistics:task:stage', onTaskUpdated);

        return () => {
            alive = false;
            emitter.off('logistics:focus:changed', onFocusChanged);
            emitter.off('logistics:task:updated', onTaskUpdated);
            emitter.off('logistics:task:stage', onTaskUpdated);
        };
    }, [task?.taskId]);

    if (!task) {
        return (
            <div className="logistics-tab-focus-summary is-empty">
                <span className="logistics-tab-focus-id">Focus 없음</span>
                <span className="logistics-tab-focus-meta">작업 선택 시 경로 표시</span>
            </div>
        );
    }

    const stages = getFocusStages(task);
    const currentIdx = stages.indexOf(task.currentStage);
    const routeClusters = getRouteClusters(task, stages);

    const linkStateForStage = (stage) => {
        if (stage === '__COMPLETE__') return task.status === 'completed' ? 'done' : 'pending';
        const idx = stages.indexOf(stage);
        if (idx < currentIdx) return 'done';
        if (idx === currentIdx && task.status === 'active') return 'current';
        if (idx === currentIdx && task.status === 'completed') return 'done';
        return 'pending';
    };

    const clusterTemplate = (cluster) => {
        if (cluster.key === 'COMPLETE') return undefined;
        const tracks = cluster.stages.flatMap((_, index) => (
            index < cluster.stages.length - 1 ? ['16px', '28px'] : ['16px']
        ));
        return { gridTemplateColumns: ['auto', ...tracks].join(' ') };
    };

    return (
        <div className="logistics-tab-focus-summary">
            <div className="logistics-tab-focus-copy">
                <span className="logistics-tab-focus-id">{task.taskId}</span>
                <span className="logistics-tab-focus-meta">
                    {STAGE_LABELS[task.currentStage] ?? task.currentStage}
                </span>
            </div>
            <div className="logistics-route-strip logistics-route-strip-compact">
                {routeClusters.map((cluster) => {
                    const isCompleteCluster = cluster.key === 'COMPLETE';
                    const wrapStyle = isCompleteCluster
                        ? { flex: '0 0 auto' }
                        : { flex: `${cluster.stages.length} 1 0` };
                    const clusterStyle = clusterTemplate(cluster);
                    return (
                        <span
                            key={cluster.key}
                            className={`logistics-route-cluster-${cluster.key.toLowerCase()}`}
                            style={wrapStyle}
                        >
                            <span
                                className={`logistics-domain-cluster${cluster.key === 'COMPLETE' ? ' is-complete-cluster' : ''}${cluster.key === 'COMPLETE' && task.status === 'completed' ? ' is-completed' : ''}`}
                                style={clusterStyle}
                            >
                                <span className="logistics-domain-label">{cluster.label}</span>
                                {cluster.stages.map((stage, si) => {
                                    const isCompletionStage = stage === '__COMPLETE__';
                                    const idx = stages.indexOf(stage);
                                    const state =
                                        isCompletionStage
                                            ? (task.status === 'completed' ? 'terminal' : 'pending')
                                            : task.status === 'failed' && idx === currentIdx ? 'fail'
                                            : task.status === 'completed' && idx === currentIdx ? 'done'
                                            : idx < currentIdx ? 'done'
                                            : idx === currentIdx ? 'current'
                                            : 'pending';
                                    const linkState = linkStateForStage(stage);

                                    return (
                                        <Fragment key={stage}>
                                            <span className="logistics-route-step">
                                                <span className={`logistics-route-node is-${state}`}>
                                                    <span className={`logistics-stage-dot is-${state}${state === 'current' || state === 'fail' ? ' sample_live_dot' : ''}`} title={isCompletionStage ? '완료' : STAGE_LABELS[stage]} />
                                                </span>
                                            </span>
                                            {si < cluster.stages.length - 1 && (
                                                <span className={`logistics-route-arrow is-${linkState}`} aria-hidden="true" />
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

export default function TabBar({
    activeTab,
    onTabChange,
    autoMode,
    onAutoToggle,
    onSettingsOpen,
    onLogOpen,
    logOpening = false,
    retentionFull = false,
    onRetentionClear,
}) {
    return (
        <nav className="logistics-tabbar">
            <div className="logistics-tab-list">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`logistics-tab-btn${activeTab === tab.id ? ' active' : ''}`}
                        onClick={() => onTabChange(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <FocusRouteSummary />
            <div className="logistics-tab-actions">
                <button className={autoMode ? 'logistics-primary-btn' : 'logistics-outline-btn'} onClick={onAutoToggle}>
                    {autoMode ? '⏸ 시뮬레이션 정지 (진행 중)' : '▶ 시뮬레이션 시작'}
                </button>
                <button className="logistics-secondary-btn" onClick={onSettingsOpen}>⚙ 설정</button>
                {retentionFull && (
                    <button className="logistics-meta-pill logistics-retention-badge" onClick={onRetentionClear}>
                        ⚠ Event Store 가득 참 — 초기화
                    </button>
                )}
                <button
                    className={`logistics-outline-btn${logOpening ? ' is-pressed' : ''}`}
                    onClick={onLogOpen}
                    aria-busy={logOpening}
                >
                    📊 전체 로그
                </button>
            </div>
        </nav>
    );
}
