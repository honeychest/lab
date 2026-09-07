// API 키 보관. chrome.storage.local 을 쓴다.
//
// 처음에는 session(메모리 전용)으로 뒀는데, 확장을 새로고침할 때마다 지워져서
// 쓸 수가 없었다. local 은 디스크에 평문으로 남는다 — 그 대신 키 자체의 권한을
// 좁혀 위험을 닫는다. 출금·이체 불가, IP 화이트리스트, 심볼 제한이 걸려 있으면
// 키가 새도 그 IP 밖에서는 아무것도 못 한다.
//
// 확장끼리는 저장소가 격리되므로 다른 확장은 이 값을 읽지 못한다.
// content script 에도 절대 넘기지 않는다 — 읽는 곳은 이 파일과 binance.js 뿐이다.

const STORAGE_KEY = 'credentials';

export async function saveCredentials(apiKey, secretKey) {
    const trimmedKey = String(apiKey ?? '').trim();
    const trimmedSecret = String(secretKey ?? '').trim();
    if (!trimmedKey || !trimmedSecret) {
        throw new Error('API 키와 시크릿 키가 모두 필요합니다');
    }
    await chrome.storage.local.set({
        [STORAGE_KEY]: { apiKey: trimmedKey, secretKey: trimmedSecret },
    });
}

export async function loadCredentials() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] ?? null;
}

export async function hasCredentials() {
    return (await loadCredentials()) !== null;
}

export async function clearCredentials() {
    await chrome.storage.local.remove(STORAGE_KEY);
}
