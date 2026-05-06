import styles from '../AuthTestPage.module.css';

export default function LoginForm({ actions }) {
    const { email, setEmail, password, setPassword, busy, runningAction, handleLogin } = actions;
    return (
        <>
            <div className={styles.label}>로그인 테스트</div>
            <form onSubmit={handleLogin} className={styles.formStack}>
                <input
                    className={styles.input}
                    type="email"
                    placeholder="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                />
                <input
                    className={styles.input}
                    type="password"
                    placeholder="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                />
                <button className={styles.primaryBtn} type="submit" disabled={busy || !email.trim()}>
                    {runningAction === 'login' ? '요청 중…' : 'Login'}
                </button>
            </form>
        </>
    );
}
