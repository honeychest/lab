// UI 관련 보조 함수들

import { STAGE_GUIDANCE, STAGE_LABELS } from '@/domain/logistics/common/stages';

export const STATE_TEXT = {
    active: '정상 진행',
    paused: '운영자 일시정지',
    failed: '실패 대응 필요',
    completed: '타임라인 완료',
    cancelled: '운영자 취소',
};

export function nodeStatusLabel(status) {
    if (status === 'all') return '전체';
    if (status === 'failed') return '실패';
    return '진행중';
}

export function latestEvent(history) {
    return history[history.length - 1] ?? null;
}

export function getStageTitle(task) {
    if (!task) return null;

    const base = STAGE_GUIDANCE[task.currentStage] ?? {
        title: STAGE_LABELS[task.currentStage] ?? task.currentStage,
    };

    return base.title;
}
