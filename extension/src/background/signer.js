// HMAC-SHA256 서명. 외부 라이브러리 없이 WebCrypto 로만 한다.

const keyCache = new Map();

async function hmacKey(secretKey) {
    if (keyCache.has(secretKey)) return keyCache.get(secretKey);
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secretKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    keyCache.set(secretKey, key);
    return key;
}

export async function sign(payload, secretKey) {
    const key = await hmacKey(secretKey);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
