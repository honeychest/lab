import { useEffect, useState } from 'react';
import apiClient from '@/api/apiClient.js';
import {
    classifyWalletError,
    classifyWalletResponse,
} from '../wallet/binanceWalletLoadPolicy.js';
import {
    applyWalletOutcome,
    createInitialWalletState,
} from '../wallet/binanceWalletState.js';

export function useBinanceWallet() {
    const [state, setState] = useState(createInitialWalletState);

    useEffect(() => {
        let active = true;

        const fetchWallet = async () => {
            try {
                const response = await apiClient.get('/api/binance/account');
                const outcome = classifyWalletResponse(response);
                if (active) {
                    setState((current) => applyWalletOutcome(current, outcome));
                }
            } catch (error) {
                const outcome = classifyWalletError(error);
                if (active) {
                    setState((current) => applyWalletOutcome(current, outcome));
                }
            }
        };

        fetchWallet();

        return () => {
            active = false;
        };
    }, []);

    return state;
}
