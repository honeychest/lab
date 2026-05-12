export function classifyWalletResponse(response) {
    const contentType = response?.headers?.['content-type'] || '';
    if (!contentType.includes('application/json')) {
        return { kind: 'server-error', code: '502' };
    }

    return { kind: 'success', data: response.data };
}

export function classifyWalletError(error) {
    const status = error?.response?.status;
    if (!status || status >= 500) {
        return { kind: 'server-error', code: String(status ?? 503) };
    }

    return {
        kind: 'wallet-error',
        message: '잔고 조회에 실패했습니다.',
    };
}
