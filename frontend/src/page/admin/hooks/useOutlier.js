import { useState } from 'react';
import chs from '@/global/chs';
import * as adminApi from '../api/adminApi';
import { OUTLIER_RANGE_OPTIONS } from '../constants';
import { datetimeLocalToMs } from '../utils';

// outlier(raw 기준 1m/5m 이상치) 진단·보정.
// healthHours/healthRange 는 useDataHealth 와 공유한다(범위 옵션 'current').
// 진단/보정 시작 시 갭 조회 결과 화면을 비워야 하므로 resetGapView 콜백을 받는다.
export default function useOutlier({ healthHours, resetGapView }) {
    const [outlierSymbol, setOutlierSymbol] = useState('BTCUSDT');
    const [outlierMarket, setOutlierMarket] = useState('FUTURES');
    const [outlierHealth, setOutlierHealth] = useState(null);
    const [outlierResult, setOutlierResult] = useState(null);
    const [outlierLoading, setOutlierLoading] = useState(false);
    const [outlierError, setOutlierError] = useState(null);
    const [outlierRangeKey, setOutlierRangeKey] = useState('current');
    const [outlierCustomFrom, setOutlierCustomFrom] = useState('');
    const [outlierCustomTo, setOutlierCustomTo] = useState('');

    const resetOutlierResults = () => {
        setOutlierHealth(null);
        setOutlierResult(null);
        setOutlierError(null);
    };

    const getOutlierRange = () => {
        const option = OUTLIER_RANGE_OPTIONS.find((item) => item.key === outlierRangeKey)
            ?? OUTLIER_RANGE_OPTIONS[0];
        if (option.key === 'custom') {
            const fromMs = datetimeLocalToMs(outlierCustomFrom);
            const toMs = datetimeLocalToMs(outlierCustomTo);
            if (!fromMs || !toMs) {
                throw new Error('직접 지정 From/To를 입력해주세요.');
            }
            if (fromMs >= toMs) {
                throw new Error('직접 지정 From은 To보다 이전이어야 합니다.');
            }
            return { fromMs, toMs };
        }
        const now = Date.now();
        if (option.useHealthHours) {
            return {
                fromMs: now - healthHours * 60 * 60 * 1000,
                toMs: now,
            };
        }
        const fromMs = now - option.fromHours * 60 * 60 * 1000;
        const toMs = now - option.toHours * 60 * 60 * 1000;
        return { fromMs, toMs };
    };

    const handleOutlierCorrectionHealth = async () => {
        chs.dlog(4, 'admin outlier 보정 진단 시작');
        resetGapView();
        let range;
        try {
            range = getOutlierRange();
        } catch (e) {
            setOutlierError(e.message);
            return;
        }
        setOutlierLoading(true);
        resetOutlierResults();
        const { fromMs, toMs } = range;
        try {
            const r = await adminApi.getOutlierCorrectionHealth({ symbol: outlierSymbol, marketType: outlierMarket, fromMs, toMs });
            setOutlierHealth(r);
        } catch (e) {
            setOutlierError(e.response?.data?.error ?? 'outlier 진단 실패');
        } finally {
            setOutlierLoading(false);
        }
    };

    const handleOutlierCorrection = async () => {
        chs.dlog(4, 'admin outlier 보정 실행 시작');
        resetGapView();
        let range;
        try {
            range = getOutlierRange();
        } catch (e) {
            setOutlierError(e.message);
            return;
        }
        setOutlierLoading(true);
        setOutlierError(null);
        setOutlierResult(null);
        const { fromMs, toMs } = range;
        try {
            const r = await adminApi.postOutlierCorrection({
                symbol: outlierSymbol,
                marketType: outlierMarket,
                fromMs,
                toMs,
            });
            setOutlierResult(r);
            setOutlierHealth(r?.health ?? null);
        } catch (e) {
            setOutlierError(e.response?.data?.error ?? 'outlier 보정 실패');
        } finally {
            setOutlierLoading(false);
        }
    };

    return {
        outlierSymbol, setOutlierSymbol,
        outlierMarket, setOutlierMarket,
        outlierHealth, outlierResult, outlierLoading, outlierError,
        outlierRangeKey, setOutlierRangeKey,
        outlierCustomFrom, setOutlierCustomFrom,
        outlierCustomTo, setOutlierCustomTo,
        handleOutlierCorrectionHealth, handleOutlierCorrection,
        resetOutlierResults,
    };
}
