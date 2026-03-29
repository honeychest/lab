import { useEffect, useState } from 'react';

export default function OverloadToast() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handler = () => {
            setVisible(true);
            setTimeout(() => setVisible(false), 4000);
        };
        window.addEventListener('server-overloaded', handler);
        return () => window.removeEventListener('server-overloaded', handler);
    }, []);

    if (!visible) return null;

    return (
        <div style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #475569',
            borderRadius: '6px',
            padding: '12px 20px',
            fontSize: '14px',
            zIndex: 99999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
            서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.
        </div>
    );
}