import { useState } from 'react';
import chs from '@/global/chs';
import * as adminApi from '../api/adminApi';

// raw 대비 1s/1m/5m 불일치(flat) 진단·보정 + flat 삭제.
export default function useDataHealth() {
    const [healthSymbol, setHealthSymbol] = useState('BTCUSDT');
    const [healthMarket, setHealthMarket] = useState('FUTURES');
    const [healthHours, setHealthHours] = useState(1);
    const [healthData, setHealthData] = useState(null);
    const [healthLoading, setHealthLoading] = useState(false);
    const [healthError, setHealthError] = useState(null);
    const [healthRange, setHealthRange] = useState(null); // { fromMs, toMs }
    const [correctionHealth, setCorrectionHealth] = useState(null);
    const [correctionResult, setCorrectionResult] = useState(null);
    const [correctionLoading, setCorrectionLoading] = useState(false);
    const [correctionError, setCorrectionError] = useState(null);
    const [deletingFlat, setDeletingFlat] = useState(null); // '1s'|'1m'|'5m'
    const [deleteMessage, setDeleteMessage] = useState(null);

    const handleHealthCheck = async () => {
        setHealthLoading(true);
        setHealthError(null);
        setHealthData(null);
        setDeleteMessage(null);
        try {
            const toMs = Date.now();
            const fromMs = toMs - healthHours * 60 * 60 * 1000;
            setHealthRange({ fromMs, toMs });
            const r = await adminApi.getBackfillHealth({ symbol: healthSymbol, marketType: healthMarket, fromMs, toMs });
            setHealthData(r);
        } catch (e) {
            setHealthError(e.response?.data?.error ?? '조회 실패');
        } finally {
            setHealthLoading(false);
        }
    };

    const handleDeleteFlat = async (tableKey) => {
        setDeletingFlat(tableKey);
        setDeleteMessage(null);
        try {
            const r = await adminApi.deleteBackfillFlat({
                symbol: healthSymbol,
                marketType: healthMarket,
                tableKey,
                fromMs: healthRange?.fromMs,
                toMs:   healthRange?.toMs,
            });
            setDeleteMessage(r?.message ?? '완료');
            await handleHealthCheck();
        } catch (e) {
            setHealthError(e.response?.data?.error ?? `${tableKey} 초기화 실패`);
        } finally {
            setDeletingFlat(null);
        }
    };

    const handleFlatCorrectionHealth = async () => {
        chs.dlog(4, 'admin 보정 진단 시작');
        setCorrectionLoading(true);
        setCorrectionError(null);
        setCorrectionHealth(null);
        const toMs = healthRange?.toMs ?? Date.now();
        const fromMs = healthRange?.fromMs ?? toMs - healthHours * 60 * 60 * 1000;
        setHealthRange({ fromMs, toMs });
        try {
            const r = await adminApi.getFlatCorrectionHealth({ symbol: healthSymbol, marketType: healthMarket, fromMs, toMs });
            setCorrectionHealth(r);
        } catch (e) {
            setCorrectionError(e.response?.data?.error ?? '보정 진단 실패');
        } finally {
            setCorrectionLoading(false);
        }
    };

    const handleFlatCorrection = async () => {
        chs.dlog(4, 'admin 보정 실행 시작');
        setCorrectionLoading(true);
        setCorrectionError(null);
        setCorrectionResult(null);
        const toMs = healthRange?.toMs ?? Date.now();
        const fromMs = healthRange?.fromMs ?? toMs - healthHours * 60 * 60 * 1000;
        setHealthRange({ fromMs, toMs });
        try {
            const r = await adminApi.postFlatCorrection({
                symbol: healthSymbol,
                marketType: healthMarket,
                fromMs,
                toMs,
            });
            setCorrectionResult(r);
            setCorrectionHealth(r?.health ?? null);
            await handleHealthCheck();
        } catch (e) {
            setCorrectionError(e.response?.data?.error ?? '보정 실패');
        } finally {
            setCorrectionLoading(false);
        }
    };

    return {
        healthSymbol, setHealthSymbol,
        healthMarket, setHealthMarket,
        healthHours, setHealthHours,
        healthData, healthLoading, healthError,
        healthRange,
        correctionHealth, correctionResult, correctionLoading, correctionError,
        deletingFlat, deleteMessage,
        handleHealthCheck, handleDeleteFlat,
        handleFlatCorrectionHealth, handleFlatCorrection,
    };
}
