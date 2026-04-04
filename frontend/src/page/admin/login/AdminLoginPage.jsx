// [AGENT] Admin 로그인 페이지 — /admin/login
// /api/auth/login 호출 후 httpOnly 쿠키 방식으로 전환 예정
import { useState } from 'react';
import Layout from '../../../shared/ui/layout/Layout.jsx';
import styles from './AdminLoginPage.module.css';
import '../../../styles/themes/monitor-teal.css';

export default function AdminLoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        // TODO: httpOnly 쿠키 방식 로그인 연동
        setError('로그인 기능 연동 전입니다.');
        setIsSubmitting(false);
    };

    return (
        <Layout footerCenter={['Admin', 'Login']} enableSupport={false}>
            <div className={styles.wrap}>
                <form className={styles.card} onSubmit={handleSubmit}>
                    <div className={styles.header}>
                        <div className={styles.lockIcon}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        </div>
                        <div className={styles.title}>Admin Login</div>
                        <div className={styles.subtitle}>관리자 인증이 필요합니다</div>
                    </div>

                    <div className={styles.form}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Email</label>
                            <input
                                className={styles.input}
                                type="email"
                                placeholder="admin@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                autoComplete="email"
                                required
                            />
                        </div>

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Password</label>
                            <input
                                className={styles.input}
                                type="password"
                                placeholder="********"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />
                        </div>

                        {error && <div className={styles.error}>{error}</div>}

                        <button className={styles.button} type="submit" disabled={isSubmitting}>
                            {isSubmitting ? '로그인 중...' : '로그인'}
                        </button>
                    </div>

                    <div className={styles.footer}>
                        허가된 관리자만 접근 가능합니다
                    </div>
                </form>
            </div>
        </Layout>
    );
}
