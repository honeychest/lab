// [AGENT] /admin/test 도메인 탭 placeholder — admin/test 전용
import '../../../styles/themes/monitor-teal.css';

const boxStyle = {
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(0,0,0,0.18)',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.75)',
    maxWidth: '560px',
};

export default function AdminTestDomainPlaceholder({ domainLabel }) {
    return (
        <div style={boxStyle}>
            <strong style={{ color: '#fff' }}>{domainLabel}</strong>
            {' '}도메인 수동 검증 UI는 아직 없습니다. README 규약에 맞춰 추가하면 됩니다.
        </div>
    );
}
