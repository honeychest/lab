// DRAFT 로그 단일 도구 — 백엔드 chs.java와 동일 인터페이스
// stage: 1=프론트+Dexie+mitt / 2=Spring+RabbitMQ+InMemory / 3=+MySQL / 4=외부연동
// 후속 단계 진입 시: dlog\([0-9] grep으로 미구현 자리 일괄 식별
// 로그 레벨 제어: localStorage.setItem('CHS_LOG_LEVEL', '2') → stage2 이하 표시 (기본값 1)
const _maxStage = Number(localStorage.getItem('CHS_LOG_LEVEL') ?? 1);

export function dlog(stage: number, message: string, ...args: unknown[]): void {
    if (import.meta.env.DEV && stage <= _maxStage) {
        console.log(`[chs][stage${stage}] ${message}`, ...args);
    }
}

export function dtag(stage: number, tags: string[], message: string, ...args: unknown[]): void {
    if (import.meta.env.DEV && stage <= _maxStage) {
        console.log(`[chs][stage${stage}][${tags.join('][')}] ${message}`, ...args);
    }
}

const chs = { dlog, dtag };
export default chs;
