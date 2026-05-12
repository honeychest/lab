export function createInitialWalletState() {
    return {
        accountInfo: null,
        walletLoading: true,
        walletError: null,
        serverError: null,
    };
}

export function applyWalletOutcome(currentState, outcome) {
    if (outcome.kind === 'success') {
        return {
            ...currentState,
            accountInfo: outcome.data,
            walletLoading: false,
        };
    }

    if (outcome.kind === 'server-error') {
        return {
            ...currentState,
            serverError: outcome.code,
            walletLoading: true,
        };
    }

    return {
        ...currentState,
        walletError: outcome.message,
        walletLoading: false,
    };
}
