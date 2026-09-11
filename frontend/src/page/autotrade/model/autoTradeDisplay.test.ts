import { describe, expect, it } from 'vitest';
import {
    toBackendConfig,
    toBackendExecution,
    toBackendStrategyConfig,
    toConfigDraft,
} from './autoTradeDisplay.js';

describe('자동매매 전략 퍼센트 표시 변환', () => {
    it('백엔드 소수값을 사용자가 이해하는 퍼센트로 바꾼다', () => {
        const draft = toConfigDraft({
            symbol: 'ENAUSDT',
            addStepPct: 0.01,
            takeProfitPct: 0.02,
            stopLossPct: 0.02,
        });

        expect(draft.addStepPct).toBe('1');
        expect(draft.takeProfitPct).toBe('2');
        expect(draft.stopLossPct).toBe('2');
    });

    it('입력한 퍼센트를 API 계약인 소수값으로 되돌린다', () => {
        const updates = toBackendConfig({
            symbol: 'ENAUSDT',
            addStepPct: '1',
            takeProfitPct: '2',
            stopLossPct: '2',
        });

        expect(updates['add-step-pct']).toBe('0.01');
        expect(updates['take-profit-pct']).toBe('0.02');
        expect(updates['stop-loss-pct']).toBe('0.02');
    });

    it('일반 전략 저장에서는 심볼을 제외한다', () => {
        const updates = toBackendStrategyConfig({
            symbol: 'BTCUSDT',
            baseNotional: '5',
            addStepPct: '1',
        });

        expect(updates.symbol).toBeUndefined();
        expect(updates['base-notional']).toBe('5');
        expect(updates['add-step-pct']).toBe('0.01');
    });

    it('화면의 실행 설정 이름을 백엔드 설정 키로 바꾼다', () => {
        const updates = toBackendExecution({
            mode: 'PAPER',
            policy: 'AUTO',
            pollIntervalMs: '1000',
        });

        expect(updates.mode).toBe('PAPER');
        expect(updates.policy).toBe('AUTO');
        expect(updates['poll-interval-ms']).toBe('1000');
    });
});
