import { useState } from 'react';
import styles from './AuthTestPage.module.css';
import useAuthTestActions from './auth-test/useAuthTestActions';
import LoginForm from './auth-test/LoginForm';
import CookieSnapshotForm from './auth-test/CookieSnapshotForm';
import ArchiveForm from './auth-test/ArchiveForm';
import ArchiveScanForm from './auth-test/ArchiveScanForm';
import ResultPanel from './auth-test/ResultPanel';

const FEATURES = [
    { key: 'login',          label: '로그인',         Form: LoginForm },
    { key: 'cookieSnapshot', label: 'Cookie Snapshot', Form: CookieSnapshotForm },
    { key: 'archive',        label: 'S3 아카이빙',    Form: ArchiveForm },
    { key: 'archiveScan',    label: 'S3 스캔',        Form: ArchiveScanForm },
];

export default function AuthTestPage() {
    const [selected, setSelected] = useState('login');
    const actions = useAuthTestActions();
    const SelectedForm = FEATURES.find(f => f.key === selected)?.Form;
    const result = actions.logs[selected];

    return (
        <div className={styles.container}>
            <div className={styles.col}>
                {FEATURES.map(f => (
                    <button
                        key={f.key}
                        className={`${styles.featureBtn} ${selected === f.key ? styles.featureBtnActive : ''}`}
                        onClick={() => setSelected(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className={styles.col}>
                {SelectedForm && <SelectedForm actions={actions} />}
            </div>

            <div className={styles.col}>
                {result
                    ? <ResultPanel result={result} featureKey={selected} />
                    : <div className={styles.placeholder}>결과가 여기에 표시됩니다.</div>}
            </div>
        </div>
    );
}
