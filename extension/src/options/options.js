// 키 입력 화면. 저장 직후 입력칸을 비운다 — 화면에 남겨 둘 이유가 없다.

const apiKeyInput = document.getElementById('apiKey');
const secretKeyInput = document.getElementById('secretKey');
const status = document.getElementById('status');

function say(text) {
    status.textContent = text;
}

async function ask(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            resolve(chrome.runtime.lastError ? { kind: 'FAILED', message: chrome.runtime.lastError.message } : response);
        });
    });
}

async function refresh() {
    const response = await ask({ kind: 'KEY_STATUS' });
    say(response?.kind === 'READY' ? '키가 저장되어 있습니다' : '키가 없습니다');
}

document.getElementById('save').addEventListener('click', async () => {
    const response = await ask({
        kind: 'SAVE_KEY',
        apiKey: apiKeyInput.value,
        secretKey: secretKeyInput.value,
    });
    apiKeyInput.value = '';
    secretKeyInput.value = '';
    say(response?.kind === 'READY' ? '저장했습니다' : (response?.message ?? '저장하지 못했습니다'));
});

document.getElementById('clear').addEventListener('click', async () => {
    await ask({ kind: 'CLEAR_KEY' });
    apiKeyInput.value = '';
    secretKeyInput.value = '';
    say('지웠습니다');
});

refresh();
