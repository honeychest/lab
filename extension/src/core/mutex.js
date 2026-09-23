// background service worker 안에서 작업 하나만 실행되게 하는 메모리 잠금.
// 모든 요청이 하나의 service worker 로 모이고 JS 는 단일 스레드라
// 확인과 설정 사이에 다른 요청이 끼어들지 않는다.
// service worker 가 죽으면 진행 중 작업도 같이 죽으므로 잠금이 남지 않는다.

export class MutexBusyError extends Error {
    constructor(label) {
        super(`다른 작업이 진행 중입니다(${label})`);
        this.name = 'MutexBusyError';
        this.label = label;
    }
}

export function createMutex() {
    let currentLabel = null;

    return {
        async run(label, fn) {
            if (currentLabel !== null) throw new MutexBusyError(currentLabel);
            currentLabel = label;
            try {
                return await fn();
            } finally {
                currentLabel = null;
            }
        },

        busyLabel() {
            return currentLabel;
        },
    };
}
