import { useState } from 'react';
import * as adminApi from '../api/adminApi';
import { datetimeLocalToMs, msToDatetimeLocal } from '../utils';

export default function useRollup() {
    const [rFrom, setRFrom] = useState(() => msToDatetimeLocal(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const [rTo, setRTo] = useState(() => msToDatetimeLocal(Date.now()));
    const [rLoading, setRLoading] = useState(false);
    const [rResult, setRResult] = useState(null); // { ok, inserted1m, inserted5m } | { ok: false, message }

    const handleRollup = async () => {
        setRLoading(true);
        setRResult(null);
        try {
            const r = await adminApi.postAggtradeRollup({
                fromMs: datetimeLocalToMs(rFrom),
                toMs:   datetimeLocalToMs(rTo),
            });
            setRResult({ ok: true, ...r });
        } catch (e) {
            setRResult({ ok: false, message: e.response?.data?.error ?? '롤업 실패' });
        } finally {
            setRLoading(false);
        }
    };

    return { rFrom, setRFrom, rTo, setRTo, rLoading, rResult, handleRollup };
}
