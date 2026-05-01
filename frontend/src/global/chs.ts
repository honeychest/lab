// DRAFT 로그 단일 도구 — 백엔드 chs.java와 동일 인터페이스
// stage: 1=프론트+Dexie+mitt / 2=Spring+RabbitMQ+InMemory / 3=+MySQL / 4=외부연동
// 후속 단계 진입 시: dlog\([0-9] grep으로 미구현 자리 일괄 식별
export function dlog(stage: number, message: string, ...args: unknown[]): void {
    if (import.meta.env.DEV) {
        console.log(`[chs][stage${stage}] ${message}`, ...args);
    }
}

export function dtag(stage: number, tags: string[], message: string, ...args: unknown[]): void {
    if (import.meta.env.DEV) {
        console.log(`[chs][stage${stage}][${tags.join('][')}] ${message}`, ...args);
    }
}

const chs = { dlog, dtag };
export default chs;
