import React from 'react';

function ServerError() {
    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: '#020617', color: '#f8fafc',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 9999, fontFamily: "sans-serif"
        }}>
            <div style={{ textAlign: 'center', padding: '20px' }}>
                {/* 서버 연결 끊김을 의미하는 정적인 아이콘 */}
                <div style={{ fontSize: '50px', marginBottom: '20px', color: '#64748b' }}>
                    <span style={{ color: '#ef4444' }}>●</span> SYSTEM OFFLINE
                </div>

                <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '16px', letterSpacing: '-0.02em' }}>
                    서버 응답 없음
                </h1>

                <div style={{ width: '40px', height: '1px', backgroundColor: '#334155', margin: '0 auto 24px' }}></div>

                <p style={{ color: '#94a3b8', lineHeight: '1.7', marginBottom: '35px', maxWidth: '450px', wordBreak: 'keep-all' }}>
                    개발자 서버와의 통신이 원활하지 않습니다.<br/>
                    현재 서버가 추가개발 중이거나 오프라인 상태일 수 있습니다.<br/>
                    나중에 다시 시도해주세요. (클라우드 서버 확보전까지는...)<br/>
                </p>

                <button
                    onClick={() => window.location.href = '/'}
                    style={{
                        padding: '12px 32px', backgroundColor: 'transparent', color: '#f8fafc',
                        border: '1px solid #475569', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '14px', fontWeight: '600', transition: '0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#1e293b'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                    연결 재시도
                </button>

                <div style={{ marginTop: '50px', fontSize: '11px', color: '#334155', letterSpacing: '2px' }}>
                    STATUS_CODE: NETWORK_ERROR_OR_SERVER_OFFLINE
                </div>
            </div>
        </div>
    );
}

export default ServerError;