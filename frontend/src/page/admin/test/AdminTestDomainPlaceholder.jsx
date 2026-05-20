// [AGENT] /admin/test 도메인 탭 placeholder — admin/test 전용
import '../../../styles/themes/monitor-teal.css';

const boxStyle = {
    padding: '24px',
    border: '1px solid var(--monitor-border)',
    background: 'var(--monitor-card-bg)',
    borderRadius: '8px',
    color: 'var(--monitor-text-secondary)',
    maxWidth: '560px',
};

export default function AdminTestDomainPlaceholder({ domainLabel }) {
    return (
        <div style={boxStyle}>
            <strong style={{ color: 'var(--monitor-text-primary)' }}>{domainLabel}</strong>
            {' '}도메인 수동 검증 UI는 아직 없습니다. README 규약에 맞춰 추가하면 됩니다.
        </div>
    );
}
