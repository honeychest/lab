// [AGENT] T4-ANALYSIS: 우측 사례 패널 — 매칭 미니차트 18개 (3×6) + 이전/다음 네비게이션
import CaseCard from './CaseCard.jsx';

const PAGE_SIZE = 18;

const navBtn = (disabled) => ({
  padding:      '4px 10px',
  background:   'transparent',
  border:       '1px solid var(--dark-input-border)',
  borderRadius: '4px',
  color:        disabled ? 'var(--dark-text-muted)' : 'var(--dark-text-secondary)',
  fontSize:     '11px',
  cursor:       disabled ? 'not-allowed' : 'pointer',
  opacity:      disabled ? 0.3 : 1,
  fontFamily:   "'Pretendard', sans-serif",
});

export default function CasesPanel({
  klineData,
  matchedIndices,
  page,
  totalCount,
  onPrev,
  onNext,
  hasPrevPage,
  paletteLevel,
  symbol,
  timeframe = '1m',
}) {
  // 최신순(내림차순) 정렬 후 현재 페이지 4개 슬라이싱
  const sorted    = [...matchedIndices].sort((a, b) => b - a);
  const pageStart = page * PAGE_SIZE;
  const pageEnd   = pageStart + PAGE_SIZE;
  const cards     = sorted.slice(pageStart, pageEnd);

  const columns = 3;
  const columnItems = Array.from({ length: columns }, (_, col) =>
    cards.filter((_, idx) => idx % columns === col)
  );

  const isFirstPage = page === 0;
  const isLastPage  = pageEnd >= sorted.length;
  const disablePrev = isFirstPage && !hasPrevPage;
  const disableNext = isLastPage;

  const countLabel = totalCount > 0
    ? `매칭 사례 (${pageStart + 1}–${Math.min(pageEnd, totalCount)}/${totalCount})`
    : '매칭 사례';

  return (
    <div style={{
      height:        '100%',
      display:       'flex',
      flexDirection: 'column',
      background:    'var(--dark-card-bg)',
      borderRadius:  '10px',
      border:        '1px solid var(--dark-input-border)',
      overflow:      'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        height:      '40px',
        flexShrink:  0,
        display:     'flex',
        alignItems:  'center',
        padding:     '0 12px',
      }}>
        <span style={{
          fontSize:   '11px',
          color:      'var(--dark-text-muted)',
          fontFamily: "'Pretendard', sans-serif",
        }}>
          {countLabel}
        </span>
      </div>

      {/* 카드 목록: 3×6 그리드 (3열, 열마다 최대 6개) */}
      <div style={{
        flex:          1,
        display:       'flex',
        flexDirection: 'column',
        padding:       '0 10px 8px 10px',
        gap:           '8px',
      }}>
        {totalCount === 0 ? (
          <div style={{
            flex:           1,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       '12px',
            color:          'var(--dark-text-muted)',
            fontFamily:     "'Pretendard', sans-serif",
          }}>
            매칭 없음
          </div>
        ) : (
          <div style={{
            flex:          1,
            display:       'flex',
            gap:           '8px',
            overflowY:     'auto',
          }}>
            {columnItems.map((col, colIdx) => (
              <div key={colIdx} style={{
                flex:          1,
                display:       'flex',
                flexDirection: 'column',
                gap:           '6px',
                minWidth:      0,
              }}>
                {col.map((idx) => (
                  <CaseCard
                    key={idx}
                    matchIndex={idx}
                    klineData={klineData}
                    paletteLevel={paletteLevel}
                    symbol={symbol}
                    timeframe={timeframe}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 네비게이션 */}
      <div style={{
        height:         '44px',
        flexShrink:     0,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 12px',
        borderTop:      '1px solid var(--dark-input-border)',
      }}>
        <button
          onClick={onPrev}
          disabled={disablePrev}
          style={navBtn(disablePrev)}
        >◀ 이전</button>
        <button
          onClick={onNext}
          disabled={disableNext}
          style={navBtn(disableNext)}
        >다음 ▶</button>
      </div>
    </div>
  );
}
