import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

function NotFound() {
    const navigate = useNavigate();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div style={{
            // 외부 CSS 간섭을 차단하기 위한 강제 초기화
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            margin: 0,
            padding: 0,
            backgroundColor: '#0a0a0c', // 깊이감 있는 다크 톤
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontFamily: "'Pretendard', sans-serif",
            color: '#ffffff',
            overflow: 'hidden'
        }}>
            {/* 세련된 배경 그라데이션 레이어 */}
            <div style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                background: 'radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)',
                opacity: 0.8
            }} />

            {/* 메인 콘텐츠 유닛 */}
            <div style={{
                position: 'relative',
                zIndex: 10,
                textAlign: 'center',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                transition: 'all 0.6s ease-out',
                padding: '0 20px'
            }}>
                <h1 style={{
                    fontSize: '120px',
                    fontWeight: '800',
                    margin: 0,
                    lineHeight: '1',
                    letterSpacing: '-0.05em',
                    background: 'linear-gradient(to bottom, #ffffff 30%, #94a3b8 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                }}>
                    404
                </h1>

                <div style={{
                    width: '40px',
                    height: '2px',
                    backgroundColor: '#3b82f6', // 포인트 컬러 (신뢰감 있는 블루)
                    margin: '30px auto'
                }} />

                <h2 style={{
                    fontSize: '24px',
                    fontWeight: '600',
                    marginBottom: '16px',
                    letterSpacing: '-0.02em',
                    color: '#f1f5f9'
                }}>
                    요청하신 페이지를 참조할 수 없습니다
                </h2>

                <p style={{
                    fontSize: '16px',
                    lineHeight: '1.6',
                    color: '#94a3b8',
                    marginBottom: '40px',
                    maxWidth: '450px',
                    wordBreak: 'keep-all'
                }}>
                    입력하신 주소가 변경되었거나 삭제되었을 수 있습니다.<br />
                    기상 데이터 서버와의 연결에는 문제가 없으니,<br />
                    아래 버튼을 클릭하여 메인 대시보드로 복귀해 주시기 바랍니다.
                </p>

                <button
                    onClick={() => navigate('/')}
                    style={{
                        padding: '14px 32px',
                        backgroundColor: 'transparent',
                        color: '#ffffff',
                        border: '1px solid #475569',
                        borderRadius: '4px',
                        fontSize: '15px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        outline: 'none'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#ffffff';
                        e.target.style.color = '#0f172a';
                        e.target.style.borderColor = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.backgroundColor = 'transparent';
                        e.target.style.color = '#ffffff';
                        e.target.style.borderColor = '#475569';
                    }}
                >
                    메인 페이지로 이동
                </button>
            </div>

            {/* 은은한 배경 장식 (생략 가능) */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '600px',
                height: '600px',
                background: 'rgba(59, 130, 246, 0.03)',
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                filter: 'blur(80px)'
            }} />
        </div>
    );
}

export default NotFound;