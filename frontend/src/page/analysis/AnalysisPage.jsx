// [AGENT] T4-ANALYSIS: 애널리시스 페이지 — 조건 빌더 + 메인 차트 + 사례 패널 + 템플릿
import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '@/api/apiClient.js';
import Layout                from '../../shared/ui/layout/Layout.jsx';
import ControlBar            from './components/ControlBar.jsx';
import MainChart             from './components/MainChart.jsx';
import ConditionBuilder      from './components/ConditionBuilder.jsx';
import CasesPanel            from './components/CasesPanel.jsx';
import TemplateBar           from './components/TemplateBar.jsx';
import TemplateManagerModal  from './components/TemplateManagerModal.jsx';
import Toast                 from './components/Toast.jsx';
import { evaluate }          from './engine/detectionEngine.js';
import { fetchKlines }       from './hooks/useBinanceKlines.js';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function fiveDaysAgoStr() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 5);
  return d.toISOString().slice(0, 10);
}
function emptyTree() {
  return { groups: [], groupOperator: 'OR', palette: 'MID' };
}

export default function AnalysisPage() {
  const [symbol,            setSymbol]            = useState('BTC');
  const [startDate,         setStartDate]         = useState(fiveDaysAgoStr());
  const [endDate,           setEndDate]           = useState(todayStr());
  const [klineData,         setKlineData]         = useState([]);
  const [loading,           setLoading]           = useState(false);
  const [loadError,         setLoadError]         = useState(null);
  const [conditionTree,     setConditionTree]     = useState(emptyTree());
  const [matchedIndices,    setMatchedIndices]    = useState([]);
  const [detectionError,    setDetectionError]    = useState(null);
  const [page,              setPage]              = useState(0);
  const [templates,         setTemplates]         = useState([]);
  const [selectedId,        setSelectedId]        = useState(null);
  const [saveState,         setSaveState]         = useState('idle'); // 'idle' | 'input' | 'saving'
  const [modalOpen,         setModalOpen]         = useState(false);
  const [toast,             setToast]             = useState(null);
  const [hasExtendedData,   setHasExtendedData]   = useState(false);
  const [isMobile,          setIsMobile]          = useState(() => window.innerWidth < 768);
  const [viewMode,          setViewMode]          = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('view') === 'desktop' ? 'desktop' : 'auto'; // 'auto' | 'desktop'
  });

  const mountedRef  = useRef(false);
  const symbolRef   = useRef(symbol);
  const startRef    = useRef(startDate);
  const endRef      = useRef(endDate);

  useEffect(() => { symbolRef.current = symbol;    }, [symbol]);
  useEffect(() => { startRef.current  = startDate; }, [startDate]);
  useEffect(() => { endRef.current    = endDate;   }, [endDate]);

  // ─── 반응형: 모바일에서는 페이지 비활성화 ──────────────────────────────────────

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const forceDesktop = viewMode === 'desktop';
  const showMobileBlocked = isMobile && !forceDesktop;

  const setDesktopView = (next) => {
    const p = new URLSearchParams(window.location.search);
    if (next === 'desktop') p.set('view', 'desktop');
    else p.delete('view');
    const nextUrl = `${window.location.pathname}${p.toString() ? `?${p.toString()}` : ''}${window.location.hash ?? ''}`;
    window.history.replaceState({}, '', nextUrl);
    setViewMode(next === 'desktop' ? 'desktop' : 'auto');
  };

  // ─── 데이터 로드 ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async (sym, start, end) => {
    setLoading(true);
    setLoadError(null);
    try {
      const klines = await fetchKlines(sym, start, end);
      setKlineData(klines);
      setPage(0);
      setHasExtendedData(false);
    } catch (e) {
      setLoadError({ status: e.status ?? null, message: e.message ?? '알 수 없는 오류' });
    } finally {
      setLoading(false);
    }
  }, []);

  // 초기 진입 자동 로드 (REQ-005)
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    Promise.all([
      loadData('BTC', fiveDaysAgoStr(), todayStr()),
      apiClient.get('/api/analysis/templates')
        .then((r) => {
          const list = Array.isArray(r.data) ? r.data : [];
          setTemplates(list);
          if (list.length > 0) {
            const first = list[0];
            setSelectedId(first.id);
            try {
              const tree = typeof first.conditions === 'string'
                ? JSON.parse(first.conditions)
                : first.conditions;
              setConditionTree(tree);
              setPage(0);
            } catch {
              // 템플릿 파싱 실패 시 조용히 무시
            }
          }
        })
        .catch(() => {}),
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 심볼 변경 즉시 재로드 (REQ-002)
  useEffect(() => {
    if (!mountedRef.current) return;
    loadData(symbol, startDate, endDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const handleLoad = () => loadData(symbol, startDate, endDate);

  // ─── 조건 변경 → 즉시 재계산 (REQ-011) ────────────────────────────────────

  useEffect(() => {
    if (klineData.length === 0 || conditionTree.groups.length === 0) {
      setMatchedIndices([]);
      setDetectionError(null);
      return;
    }
    try {
      const indices = evaluate(klineData, conditionTree);
      setMatchedIndices(indices);
      setDetectionError(null);
    } catch {
      setDetectionError('조건 계산 실패');
    }
  }, [conditionTree, klineData]);

  // ─── 사례 패널 네비게이션 ──────────────────────────────────────────────────

  const handlePrev = async () => {
    if (page > 0) { setPage(page - 1); return; }
    // 이전 기간 추가 로드
    const prevStart = new Date(startDate + 'T00:00:00Z');
    prevStart.setUTCDate(prevStart.getUTCDate() - 1);
    const prevStartStr = prevStart.toISOString().slice(0, 10);
    try {
      setLoading(true);
      const prevKlines = await fetchKlines(symbol, prevStartStr, prevStartStr);
      setKlineData((prev) => [...prevKlines, ...prev]);
      setStartDate(prevStartStr);
      setHasExtendedData(true);
    } catch (e) {
      setToast({ message: `이전 데이터 로드 실패: ${e.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    const PAGE_SIZE = 18;
    if ((page + 1) * PAGE_SIZE < matchedIndices.length) setPage(page + 1);
  };

  // ─── 조건 빌더 핸들러 ─────────────────────────────────────────────────────

  const handleTreeChange = (newTree) => {
    setConditionTree(newTree);
    setPage(0);
  };

  const handleReset = () => {
    setConditionTree(emptyTree());
    setMatchedIndices([]);
    setDetectionError(null);
    setPage(0);
  };

  // ─── 템플릿 저장 ──────────────────────────────────────────────────────────

  const handleSaveClick = () => {
    // 항상 확인 입력 팝업으로 시작 (선택된 템플릿 이름을 기본값으로 사용)
    setSaveState('input');
  };

  const handleSaveConfirm = async (name) => {
    if (!name) { setSaveState('idle'); return; }
    setSaveState('saving');
    const trimmed = name.trim();
    if (!trimmed) { setSaveState('idle'); return; }

    // 현재 선택된 템플릿과 이름이 같으면: 해당 템플릿 덮어쓰기
    const current = selectedId != null ? templates.find((t) => t.id === selectedId) : null;
    const isOverwrite = current && current.name === trimmed;

    try {
      if (isOverwrite && selectedId != null) {
        const res = await apiClient.put(`/api/analysis/templates/${selectedId}`, {
          name: trimmed,
          conditions: JSON.stringify(conditionTree),
          palette:    conditionTree.palette ?? 'MID',
        });
        setTemplates((prev) => prev.map((t) => (t.id === selectedId ? res.data : t)));
        setToast({ message: `'${trimmed}' 템플릿이 업데이트되었습니다.`, type: 'success' });
      } else {
        // 새 이름이거나 선택된 템플릿이 없는 경우 → 새 템플릿 생성
        const res = await apiClient.post('/api/analysis/templates', {
          name: trimmed,
          conditions: JSON.stringify(conditionTree),
          palette:    conditionTree.palette ?? 'MID',
        });
        setTemplates((prev) => [res.data, ...prev]);
        setSelectedId(res.data.id);
        setToast({ message: `'${trimmed}' 저장되었습니다.`, type: 'success' });
      }
    } catch {
      setToast({ message: '저장에 실패했습니다. 다시 시도해주세요.', type: 'error' });
    } finally {
      setSaveState('idle');
    }
  };

  // ─── 템플릿 불러오기 ─────────────────────────────────────────────────────

  const handleSelectTemplate = (template) => {
    setSelectedId(template.id);
    try {
      const tree = typeof template.conditions === 'string'
        ? JSON.parse(template.conditions)
        : template.conditions;
      setConditionTree(tree);
      setPage(0);
    } catch {
      setToast({ message: '템플릿 복원에 실패했습니다.', type: 'error' });
    }
  };

  // ─── 템플릿 관리 ─────────────────────────────────────────────────────────

  const handleRename = async (id, newName) => {
    try {
      const res = await apiClient.put(`/api/analysis/templates/${id}`, { name: newName });
      setTemplates((prev) => prev.map((t) => t.id === id ? res.data : t));
      setToast({ message: '이름이 변경되었습니다.', type: 'success' });
    } catch {
      setToast({ message: '이름 변경에 실패했습니다.', type: 'error' });
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/api/analysis/templates/${id}`);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (selectedId === id) setSelectedId(null);
      setToast({ message: '삭제되었습니다.', type: 'delete' });
    } catch {
      setToast({ message: '삭제에 실패했습니다.', type: 'error' });
    }
  };

  const paletteLevel = conditionTree.palette ?? 'MID';

  return (
    <Layout>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{
        display:         'flex',
        flexDirection:   'column',
        height:          '100%',
        backgroundColor: '#06060c',
        padding:         '4px',
        gap:             '4px',
        overflow:        'hidden',
      }}>
        {showMobileBlocked ? (
          <div style={{
            flex:           1,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            color:          'rgba(255,255,255,0.7)',
            fontFamily:     "'Pretendard', sans-serif",
            fontSize:       '0.94rem',
            gap:            '12px',
          }}>
            <div>데스크톱 화면에서만 분석 페이지를 사용할 수 있습니다.</div>
            <button
              type="button"
              onClick={() => setDesktopView('desktop')}
              style={{
                border:       '1px solid rgba(255,255,255,0.14)',
                background:   'rgba(255,255,255,0.06)',
                color:        'rgba(255,255,255,0.92)',
                borderRadius: '10px',
                padding:      '10px 12px',
                fontWeight:   900,
                cursor:       'pointer',
              }}
            >
              PC화면으로 보기
            </button>
          </div>
        ) : (
        <>
        {isMobile && forceDesktop && (
          <div style={{
            display:        'flex',
            justifyContent: 'flex-end',
            gap:            '8px',
          }}>
            <button
              type="button"
              onClick={() => setDesktopView('auto')}
              style={{
                border:       '1px solid rgba(255,255,255,0.14)',
                background:   'rgba(255,255,255,0.06)',
                color:        'rgba(255,255,255,0.92)',
                borderRadius: '10px',
                padding:      '8px 10px',
                fontWeight:   900,
                cursor:       'pointer',
              }}
            >
              모바일로 보기
            </button>
          </div>
        )}
        {/* 컨트롤 바 */}
        <ControlBar
          symbol={symbol}
          onSymbolChange={setSymbol}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onLoad={handleLoad}
          loading={loading}
        />

        {/* 본문 */}
        <div style={{ flex: 1, display: 'flex', gap: '4px', overflow: 'hidden', minHeight: 0 }}>
          {/* 좌측 영역: 메인 차트 + 조건 필터 (가로 50%) */}
          <div style={{
            flexBasis:     '50%',
            maxWidth:      '50%',
            minWidth:      0,
            display:       'flex',
            flexDirection: 'column',
            gap:           '8px',
            overflow:      'hidden',
          }}>
            {/* 상단: 메인 차트, 하단: 조건 빌더 (세로 50% / 50%) */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <MainChart
                  klineData={klineData}
                  matchedIndices={matchedIndices}
                  paletteLevel={paletteLevel}
                  loading={loading}
                  error={loadError}
                  onRetry={handleLoad}
                />
              </div>

              <div style={{
                flex:         1,
                minHeight:    0,
                background:   '#0e0f18',
                borderRadius: '10px',
                border:       '1px solid rgba(255,255,255,0.06)',
                padding:      '10px 12px',
                overflowY:    'auto',
              }}>
                <ConditionBuilder
                  conditionTree={conditionTree}
                  onTreeChange={handleTreeChange}
                onSave={handleSaveClick}
                  onReset={handleReset}
                  detectionError={detectionError}
                />
              </div>
            </div>

            {/* 템플릿 바 (하단 고정) */}
            <div style={{
              background:   '#0e0f18',
              borderRadius: '10px',
              border:       '1px solid rgba(255,255,255,0.06)',
              padding:      '8px 12px',
              flexShrink:   0,
            }}>
              <TemplateBar
                templates={templates}
                selectedId={selectedId}
                onSelect={handleSelectTemplate}
                onManage={() => setModalOpen(true)}
                saveState={saveState}
                onSaveClick={handleSaveClick}
                onSaveConfirm={handleSaveConfirm}
                onSaveCancel={() => setSaveState('idle')}
              />
            </div>
          </div>

          {/* 우측 사례 패널: 나머지 가로 영역 전체 사용 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <CasesPanel
              klineData={klineData}
              matchedIndices={matchedIndices}
              page={page}
              totalCount={matchedIndices.length}
              onPrev={handlePrev}
              onNext={handleNext}
              hasPrevPage={!hasExtendedData}
              paletteLevel={paletteLevel}
              symbol={symbol}
            />
          </div>
        </div>
        </>
        )}
      </div>

      {/* 템플릿 관리 팝업 */}
      {modalOpen && (
        <TemplateManagerModal
          templates={templates}
          onClose={() => setModalOpen(false)}
          onLoad={handleSelectTemplate}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}

      {/* 토스트 */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </Layout>
  );
}
