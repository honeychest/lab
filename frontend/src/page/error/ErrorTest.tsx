// Purpose: 에러 페이지 테스트용 — 개발 환경에서만 사용
import { useNavigate } from 'react-router-dom';

const CODES = ['400', '401', '403', '404', '429', '500', '502', '503', '504'];

export default function ErrorTest() {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: '100vh', backgroundColor: '#0a0a0c',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Pretendard', sans-serif", gap: '12px',
        }}>
            <div style={{ color: '#64748b', fontSize: '12px', letterSpacing: '2px', marginBottom: '8px' }}>
                ERROR PAGE TEST
            </div>
            {CODES.map((code) => (
                <button
                    key={code}
                    onClick={() => navigate(`/error?code=${code}`)}
                    style={{
                        width: '220px', padding: '12px',
                        backgroundColor: 'transparent',
                        color: '#f1f5f9',
                        border: '1px solid #1e293b',
                        borderRadius: '4px', fontSize: '14px',
                        cursor: 'pointer', transition: 'all 0.2s',
                        letterSpacing: '1px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e293b')}
                >
                    {code}
                </button>
            ))}
        </div>
    );
}
