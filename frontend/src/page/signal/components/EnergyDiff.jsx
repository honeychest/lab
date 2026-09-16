// [AGENT] Signal Dashboard EnergyDiff — 현물과 선물 에너지 차이와 청산을 표시
// 하단 슬롯의 첫 번째 행에 놓이며 현물·선물·청산을 가로로 표시한다.
// 별도 컴포넌트인 이유: DivergenceBar 는 다이버전스가 없으면 visibility:hidden 이 되지만 이 값은 상시로 봐야 한다.
// 청산은 의미가 반대다 — 롱 청산이 크다는 건 롱이 터졌다는 뜻이라 시장은 숏 우세로 표기한다(invert).
import { formatWithComma } from '../../../shared/lib/utils.ts';

function buildImbalance(longValue, shortValue) {
    const long = Number(longValue) || 0;
    const short = Number(shortValue) || 0;
    const total = long + short;
    const ratio = total > 0 ? (long - short) / total : 0;
    return {
        hasData: total > 0,
        ratio,
        longDominant: ratio > 0,
        money: `${long - short < 0 ? '-$' : '$'}${formatWithComma(Math.floor(Math.abs(long - short)))}`,
    };
}

function formatImbalanceRatio(ratio) {
    return `${ratio > 0 ? '+' : ''}${(ratio * 100).toFixed(1)}%`;
}

function buildDiff(longValue, shortValue, invert) {
    const long = Number(longValue) || 0;
    const short = Number(shortValue) || 0;
    if (long + short <= 0) return null;

    const diff = long - short;
    const longDominant = invert ? diff < 0 : diff > 0;

    return {
        longDominant,
        // 부호는 시장 우세 방향 — 롱 우세 +, 숏 우세 -. 색과 부호가 같은 방향을 가리킨다.
        amount: (longDominant ? '+$' : '-$') + formatWithComma(Math.floor(Math.abs(diff))),
    };
}

function ImbalanceItem({ label, diff }) {
    if (!diff.hasData) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--black-text-muted)' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--black-text-muted)' }}>{formatImbalanceRatio(diff.ratio)}</span>
            </span>
        );
    }
    return (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--black-text-muted)' }}>{label}</span>
            <span style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: '6px',
            }}>
                <span style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: diff.ratio === 0
                        ? 'var(--black-text-muted)'
                        : diff.longDominant
                            ? 'var(--black-long)'
                            : 'var(--black-short)',
                }}>
                    {diff.money}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--black-text-muted)' }}>
                    {formatImbalanceRatio(diff.ratio)}
                </span>
            </span>
        </span>
    );
}

function DiffItem({ label, diff }) {
    if (!diff) return null;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '500', color: 'var(--black-text-muted)' }}>{label}</span>
            <span style={{
                fontSize: '16px',
                fontWeight: '700',
                color: diff.longDominant ? 'var(--black-long)' : 'var(--black-short)',
            }}>
                {diff.amount}
            </span>
        </span>
    );
}

export default function EnergyDiff({
    spotLongEnergy,
    spotShortEnergy,
    futuresLongEnergy,
    futuresShortEnergy,
    longLiqTotal,
    shortLiqTotal,
}) {
    const spotImbalance = buildImbalance(spotLongEnergy, spotShortEnergy);
    const futuresImbalance = buildImbalance(futuresLongEnergy, futuresShortEnergy);
    const liqDiff    = buildDiff(longLiqTotal, shortLiqTotal, true);
    const hasEnergy = spotImbalance.hasData || futuresImbalance.hasData;

    if (!hasEnergy && !liqDiff) return null;

    // 라벨은 "어느 쪽이 청산됐나", 부호·색은 "그래서 시장이 어느 쪽 우세인가" — 둘은 반대 방향을 가리킨다.
    const liqLabel = liqDiff?.longDominant ? '숏청산' : '롱청산';

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-evenly',
                gap: '16px',
                minWidth: 0,
                letterSpacing: '0.3px',
                fontFamily: "'Pretendard', sans-serif",
                whiteSpace: 'nowrap',
            }}
        >
            {hasEnergy && (
                <>
                    <ImbalanceItem label="현물" diff={spotImbalance} />
                    <ImbalanceItem label="선물" diff={futuresImbalance} />
                </>
            )}
            {hasEnergy && liqDiff && (
                <span style={{ width: '1px', height: '16px', backgroundColor: 'var(--black-border-subtle)' }} />
            )}
            <DiffItem label={liqLabel} diff={liqDiff} />
        </div>
    );
}
