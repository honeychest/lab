import { Fragment, useEffect, useState } from 'react';
import { emitter } from '@/domain/logistics/common/emitter';
import { getFocusedTaskId } from '@/store/focusStore';
import { getTaskById } from '@/store/taskStore';
import {
    EOS_STAGES, INBOUND_STAGES, OMS_STAGES, QMS_STAGES, TMS_STAGES,
    STAGE_LABELS, EOS_PIPELINE, PIPELINE_STAGES,
} from '@/domain/logistics/common/stages';

const INBOUND_LANE = [
    { key: 'eos',     label: 'EOS',     stages: EOS_STAGES,     tab: 'eos' },
    { key: 'inbound', label: 'INBOUND', stages: INBOUND_STAGES, tab: 'inbound' },
];

const ORDER_LANE = [
    { key: 'oms',   label: 'OMS',   stages: OMS_STAGES,                                                tab: 'oms' },
    { key: 'wms-1', label: 'WMS-1', stages: ['WMS_RECEIVED', 'WMS_ALLOCATED', 'WMS_PICKING', 'WMS_PACKED'], tab: 'wms-1' },
    { key: 'qms',   label: 'QMS',   stages: QMS_STAGES,                                                tab: 'qms' },
    { key: 'wms-2', label: 'WMS-2', stages: ['WMS_DISPATCHED', 'WMS_COMPLETED'],                       tab: 'wms-2' },
    { key: 'tms',   label: 'TMS',   stages: TMS_STAGES,                                                tab: 'tms' },
    { key: 'aft',   label: 'AFT',   stages: ['AFT_BILLING', 'AFT_CLOSED'],                             tab: 'aft' },
];

function dotState(stage, task, allStages) {
    if (!task) return 'pending';
    const ci = allStages.indexOf(task.currentStage);
    const si = allStages.indexOf(stage);
    if (task.status === 'completed') return 'done';
    if (task.status === 'failed' && si === ci) return 'fail';
    if (si < ci) return 'done';
    if (si === ci) return 'current';
    return 'pending';
}

function connState(fromStage, task, allStages) {
    if (!task) return 'pending';
    const ci = allStages.indexOf(task.currentStage);
    const si = allStages.indexOf(fromStage);
    if (task.status === 'completed') return 'done';
    if (si < ci) return 'done';
    if (si === ci) return 'current';
    return 'pending';
}

function RouteStrip({ clusters, task, allStages, activeTab, onTabChange }) {
    return (
        <div className="logistics-route-strip-compact">
            {clusters.map((cluster, ci) => {
                const lastStage = cluster.stages[cluster.stages.length - 1];
                const interConn = connState(lastStage, task, allStages);
                const isClusterDone = cluster.stages.every(s => dotState(s, task, allStages) === 'done');
                const isFinalCluster = ci === clusters.length - 1;
                return (
                    <Fragment key={cluster.key}>
                        <button
                            type="button"
                            className={`logistics-domain-cluster${isClusterDone ? ' is-cluster-done' : ''}${activeTab === cluster.tab ? ' is-tab-active' : ''}`}
                            onClick={() => onTabChange(cluster.tab)}
                        >
                            <div className="logistics-cluster-dots">
                                {cluster.stages.map((stage, si) => {
                                    const ds = dotState(stage, task, allStages);
                                    const cs = connState(stage, task, allStages);
                                    const isLastDot = si === cluster.stages.length - 1;
                                    return (
                                        <Fragment key={stage}>
                                            <span className="logistics-route-step">
                                                <span className={`logistics-route-node is-${ds}`}>
                                                    <span
                                                        className={`logistics-stage-dot is-${ds}${ds === 'current' || ds === 'fail' ? ' sample_live_dot' : ''}${isLastDot && isClusterDone && isFinalCluster ? ' is-check' : ''}`}
                                                        title={STAGE_LABELS[stage] ?? stage}
                                                    />
                                                </span>
                                            </span>
                                            {si < cluster.stages.length - 1 && (
                                                <span className={`logistics-route-arrow is-${cs}`} aria-hidden="true" />
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </div>
                            <span className="logistics-domain-label">{cluster.label}</span>
                        </button>
                        {ci < clusters.length - 1 && (
                            <span className={`logistics-route-arrow is-${interConn}`} aria-hidden="true" />
                        )}
                    </Fragment>
                );
            })}
        </div>
    );
}

function TwoLaneMap({ task, activeTab, onTabChange }) {
    const isInbound = task?.type === 'EOS' || task?.type === 'INBOUND';
    const isOrder   = !!task && !isInbound;
    return (
        <div className="logistics-two-lane-map">
            <div className={`logistics-route-lane${isInbound ? ' is-active' : ''}`}>
                <span className="logistics-lane-label">입고</span>
                <RouteStrip clusters={INBOUND_LANE} task={isInbound ? task : null} allStages={EOS_PIPELINE} activeTab={activeTab} onTabChange={onTabChange} />
            </div>
            <div className={`logistics-route-lane${isOrder ? ' is-active' : ''}`}>
                <span className="logistics-lane-label">출고</span>
                <RouteStrip clusters={ORDER_LANE} task={isOrder ? task : null} allStages={PIPELINE_STAGES} activeTab={activeTab} onTabChange={onTabChange} />
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
}) {
    const [task, setTask] = useState(null);

    useEffect(() => {
        let alive = true;
        const refresh = async (taskId = getFocusedTaskId()) => {
            const t = taskId ? await getTaskById(taskId) : null;
            if (alive) setTask(t ?? null);
        };
        const onFocusChanged = ({ taskId }) => refresh(taskId);
        const onTaskUpdated  = ({ taskId }) => { if (task?.taskId === taskId) refresh(taskId); };
        refresh();
        emitter.on('logistics:focus:changed', onFocusChanged);
        emitter.on('logistics:task:updated',  onTaskUpdated);
        emitter.on('logistics:task:stage',    onTaskUpdated);
        return () => {
            alive = false;
            emitter.off('logistics:focus:changed', onFocusChanged);
            emitter.off('logistics:task:updated',  onTaskUpdated);
            emitter.off('logistics:task:stage',    onTaskUpdated);
        };
    }, [task?.taskId]);

    return (
        <nav className="logistics-tabbar">
            <div className="logistics-tabbar-row logistics-tabbar-row-compact">
                <div className="logistics-system-map-panel">
                    <TwoLaneMap task={task} activeTab={activeTab} onTabChange={onTabChange} />
                </div>

                <div className="logistics-tab-actions">
                    <button
                        className={`logistics-run-btn${autoMode ? ' is-running' : ''}`}
                        onClick={onAutoToggle}
                    >
                        {autoMode ? '■ 자동주문 정지' : '▶ 시뮬레이션 시작'}
                    </button>
                    <button className="logistics-secondary-btn" onClick={onSettingsOpen}>⚙ 설정</button>
                    <button
                        className={`logistics-outline-btn${logOpening ? ' is-pressed' : ''}`}
                        onClick={onLogOpen}
                        aria-busy={logOpening}
                    >
                        📊 로그
                    </button>
                </div>
            </div>
        </nav>
    );
}
