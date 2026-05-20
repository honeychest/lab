// [AGENT] T4-ANALYSIS: 우측 사례 패널 — 매칭 미니차트 18개 (3×6) + 이전/다음 네비게이션
import CaseCard from './CaseCard.jsx';

const PAGE_SIZE = 18;

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
    <div className="analysis-card analysis-cases">
      {/* 헤더 */}
      <div className="analysis-cases__header">
        <span className="analysis-cases__count">{countLabel}</span>
      </div>

      {/* 카드 목록: 3×6 그리드 (3열, 열마다 최대 6개) */}
      <div className="analysis-cases__body">
        {totalCount === 0 ? (
          <div className="analysis-cases__empty">매칭 없음</div>
        ) : (
          <div className="analysis-cases__grid">
            {columnItems.map((col, colIdx) => (
              <div key={colIdx} className="analysis-cases__col">
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
      <div className="analysis-cases__nav">
        <button onClick={onPrev} disabled={disablePrev} className="analysis-cases__nav-btn">◀ 이전</button>
        <button onClick={onNext} disabled={disableNext} className="analysis-cases__nav-btn">다음 ▶</button>
      </div>
    </div>
  );
}
