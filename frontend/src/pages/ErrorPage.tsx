// Purpose: 통합 에러 페이지 — ?code= 쿼리 파라미터로 4xx/5xx 에러 코드별 안내 제공
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';

// alert.json: 경고성 에러 (400, 401, 403, 429, 500)
// denyX.json: 거부/없음 에러 (404, 502, 503, 504)
const alertAnim = '/lottie/alert.json';
const denyAnim  = '/lottie/denyX.json';

interface ErrorInfo {
    animation: string;
    title: string;
    desc: string;
    detail: string;
    action: 'home' | 'back' | 'retry';
}

const ERROR_MAP: Record<string, ErrorInfo> = {
    '400': {
        animation: alertAnim,
        title: '잘못된 요청',
        desc: '요청 형식이 올바르지 않습니다.\n파라미터를 확인하거나 처음부터 다시 시도해 주세요.',
        detail: 'STATUS: 400 BAD_REQUEST',
        action: 'back',
    },
    '401': {
        animation: alertAnim,
        title: '인증이 필요합니다',
        desc: '이 페이지에 접근하려면 로그인이 필요합니다.\n로그인 후 다시 시도해 주세요.',
        detail: 'STATUS: 401 UNAUTHORIZED',
        action: 'home',
    },
    '403': {
        animation: alertAnim,
        title: '접근 권한 없음',
        desc: '이 페이지에 접근할 권한이 없습니다.\n계정 권한을 확인하거나 관리자에게 문의해 주세요.',
        detail: 'STATUS: 403 FORBIDDEN',
        action: 'home',
    },
    '404': {
        animation: denyAnim,
        title: '페이지를 찾을 수 없습니다',
        desc: '요청하신 주소가 존재하지 않습니다.\nURL을 다시 확인하거나 메인 페이지로 이동해 주세요.',
        detail: 'STATUS: 404 NOT_FOUND',
        action: 'home',
    },
    '429': {
        animation: alertAnim,
        title: '요청이 너무 많습니다',
        desc: '짧은 시간에 너무 많은 요청이 발생했습니다.\n잠시 후 다시 시도해 주세요.',
        detail: 'STATUS: 429 TOO_MANY_REQUESTS',
        action: 'retry',
    },
    '500': {
        animation: alertAnim,
        title: '서버 내부 오류',
        desc: '서버에서 요청을 처리하는 중 문제가 발생했습니다.\n잠시 후 다시 시도하거나 개발자에게 문의해 주세요.',
        detail: 'STATUS: 500 INTERNAL_SERVER_ERROR',
        action: 'retry',
    },
    '502': {
        animation: denyAnim,
        title: '게이트웨이 오류',
        desc: '백엔드 서버가 응답하지 않습니다.\n서버가 재시작 중이거나 일시적으로 중단된 상태일 수 있습니다.',
        detail: 'STATUS: 502 BAD_GATEWAY',
        action: 'retry',
    },
    '503': {
        animation: denyAnim,
        title: '서비스 점검 중',
        desc: '현재 서버가 유지보수 또는 배포 중입니다.\n잠시 후 다시 접속해 주세요.',
        detail: 'STATUS: 503 SERVICE_UNAVAILABLE',
        action: 'retry',
    },
    '504': {
        animation: denyAnim,
        title: '응답 시간 초과',
        desc: '백엔드 서버의 응답이 너무 오래 걸리고 있습니다.\n네트워크 상태를 확인하거나 잠시 후 재시도해 주세요.',
        detail: 'STATUS: 504 GATEWAY_TIMEOUT',
        action: 'retry',
    },
};

const FALLBACK: ErrorInfo = {
    animation: alertAnim,
    title: '알 수 없는 오류',
    desc: '예상치 못한 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.',
    detail: 'STATUS: UNKNOWN_ERROR',
    action: 'home',
};

/**
 * @param codeProp - 인라인 렌더 시 부모 컴포넌트에서 직접 전달하는 에러 코드.
 *                   미전달 시 URL ?code= 쿼리 파라미터로 fallback.
 *                   덕분에 URL을 바꾸지 않고 현재 페이지에서 에러 UI를 표시할 수 있음.
 */
export default function ErrorPage({ code: codeProp }: { code?: string } = {}) {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [mounted, setMounted] = useState(false);
    const [animData, setAnimData] = useState<object | null>(null);

    // prop이 있으면 prop 우선, 없으면 URL searchParams에서 읽음
    const code = codeProp ?? searchParams.get('code') ?? '';
    const info = ERROR_MAP[code] ?? FALLBACK;

    useEffect(() => {
        setMounted(true);
    }, []);

    // Lottie JSON을 fetch로 로드 (public 폴더 기준 경로)
    useEffect(() => {
        setAnimData(null);
        fetch(info.animation)
            .then((res) => res.json())
            .then((data) => setAnimData(data))
            .catch(() => setAnimData(null));
    }, [info.animation]);

    const handleAction = () => {
        if (info.action === 'home')  navigate('/');
        if (info.action === 'back')  navigate(-1);
        if (info.action === 'retry') window.location.reload();
    };

    const actionLabel = {
        home:  '메인 페이지로 이동',
        back:  '이전 페이지로 돌아가기',
        retry: '다시 시도',
    }[info.action];

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0,
            width: '100vw', height: '100vh',
            backgroundColor: '#0a0a0c',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            color: '#f1f5f9',
            overflow: 'hidden',
            zIndex: 9999,
        }}>
            {/* 방사형 그라데이션 배경 */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
                opacity: 0.8,
            }} />

            {/* 블루 블러 장식 */}
            <div style={{
                position: 'absolute',
                top: '50%', left: '50%',
                width: '600px', height: '600px',
                background: 'rgba(59, 130, 246, 0.04)',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                filter: 'blur(80px)',
            }} />

            {/* 콘텐츠 */}
            <div style={{
                position: 'relative', zIndex: 10,
                textAlign: 'center',
                padding: '0 20px',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                transition: 'all 0.6s ease-out',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
                {/* Lottie 애니메이션 */}
                <div style={{ width: '200px', height: '200px', marginBottom: '8px' }}>
                    {animData && (
                        <Lottie
                            animationData={animData}
                            loop
                            style={{ width: '100%', height: '100%' }}
                        />
                    )}
                </div>

                {/* 에러 코드 숫자 */}
                {code && (
                    <div style={{
                        fontSize: '80px', fontWeight: '800', lineHeight: 1,
                        letterSpacing: '-0.05em',
                        background: 'linear-gradient(to bottom, #ffffff 30%, #94a3b8 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '4px',
                    }}>
                        {code}
                    </div>
                )}

                {/* 구분선 */}
                <div style={{
                    width: '40px', height: '2px',
                    backgroundColor: '#3b82f6',
                    margin: '20px auto',
                }} />

                {/* 제목 */}
                <h1 style={{
                    fontSize: '22px', fontWeight: '600',
                    letterSpacing: '-0.02em',
                    color: '#f1f5f9',
                    marginBottom: '16px',
                }}>
                    {info.title}
                </h1>

                {/* 설명 */}
                <p style={{
                    fontSize: '15px', lineHeight: '1.7',
                    color: '#94a3b8',
                    marginBottom: '32px',
                    maxWidth: '440px',
                    wordBreak: 'keep-all',
                    whiteSpace: 'pre-line',
                }}>
                    {info.desc}
                </p>

                {/* 상태 코드 뱃지 */}
                <div style={{
                    display: 'inline-block',
                    fontSize: '12px', color: '#475569',
                    background: 'rgba(71, 85, 105, 0.15)',
                    border: '1px solid #1e293b',
                    borderRadius: '4px',
                    padding: '6px 14px',
                    letterSpacing: '1px',
                    marginBottom: '36px',
                }}>
                    {info.detail}
                </div>

                {/* 액션 버튼 */}
                <button
                    onClick={handleAction}
                    style={{
                        padding: '13px 28px',
                        backgroundColor: 'transparent',
                        color: '#f8fafc',
                        border: '1px solid #475569',
                        borderRadius: '4px',
                        fontSize: '14px', fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        outline: 'none',
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#ffffff';
                        (e.currentTarget as HTMLButtonElement).style.color = '#0f172a';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                        (e.currentTarget as HTMLButtonElement).style.color = '#f8fafc';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#475569';
                    }}
                >
                    {actionLabel}
                </button>

                {/* 하단 상태 코드 */}
                <div style={{
                    marginTop: '48px',
                    fontSize: '11px', color: '#334155',
                    letterSpacing: '2px',
                }}>
                    {info.detail}
                </div>
            </div>
        </div>
    );
}
