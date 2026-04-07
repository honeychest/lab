import ApiCallMetricsCard from './ApiCallMetricsCard.jsx';
import { AUTH_TEST_METRIC_ORDER } from './authTestActionKeys.js';
import { columnCardStyle, sectionDescriptionStyle, sectionTitleStyle } from './authTestStyles.js';

const metricsGridStyle = {
    display: 'grid',
    gap: '10px',
};

export default function AuthTestMetricsColumn({ actionLogs }) {
    return (
        <section style={columnCardStyle}>
            <div style={sectionTitleStyle}>메트릭</div>
            <div style={sectionDescriptionStyle}>
                각 액션별 마지막 호출의 상태 코드, 지연 시간, 시각을 표시합니다. 복합 시퀀스는 단계 목록을 함께 보여 줍니다.
            </div>
            <div style={metricsGridStyle}>
                {AUTH_TEST_METRIC_ORDER.map(({ key, title }) => {
                    const result = actionLogs[key];
                    if (result == null) return null;
                    return (
                        <ApiCallMetricsCard key={key} title={title} result={result} />
                    );
                })}
            </div>
        </section>
    );
}
