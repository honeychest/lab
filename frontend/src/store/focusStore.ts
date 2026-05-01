import { emitter } from '@/domain/logistics/common/emitter';

let _focusedTaskId: string | null = null;
let _autoFocusApplied = false; // 첫 Task 자동 포커스 1회 적용 여부 (DECISION-LOG [7])

export function getFocusedTaskId(): string | null {
    return _focusedTaskId;
}

// 명시 선택 — 카드 클릭 / 목록 행 클릭 / 드롭다운 선택
export function setFocus(taskId: string | null): void {
    _focusedTaskId = taskId;
    emitter.emit('logistics:focus:changed', { taskId });
}

// 첫 Task 자동 포커스 — Auto 모드에서 첫 생성 시 1회만 (DECISION-LOG [7])
export function applyAutoFocus(taskId: string): void {
    if (_autoFocusApplied) return;
    _autoFocusApplied = true;
    _focusedTaskId = taskId;
    emitter.emit('logistics:focus:changed', { taskId });
}

export function resetFocusState(): void {
    _autoFocusApplied = false;
    _focusedTaskId = null;
    emitter.emit('logistics:focus:changed', { taskId: null });
}
