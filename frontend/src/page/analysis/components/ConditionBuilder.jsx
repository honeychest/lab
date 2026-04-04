// [AGENT] T4-ANALYSIS: 조건 빌더 — 그룹 목록 + 저장/초기화 + 오류 표시
import ConditionGroup from './ConditionGroup.jsx';
import { explainTree } from '../engine/conditionExplain.js';

const GROUP_LINK_OPERATORS = ['AND', 'OR'];

function defaultGroup() {
  return {
    operator:      'AND',
    units:         [{ type: 'VOLUME_SPIKE', op: 'GT', value: 2, palette: 'MID' }],
    unitOperators: [],
  };
}

const btn = (primary = false) => ({
  background:   primary ? 'var(--dark-btn-primary)' : 'var(--dark-btn-secondary)',
  border:       primary ? 'none' : '1px solid var(--dark-input-border)',
  borderRadius: '4px',
  color:        'var(--dark-input-text)',
  fontSize:     '12px',
  padding:      '5px 12px',
  cursor:       'pointer',
  fontFamily:   "'Pretendard', sans-serif",
});

function computeTreePalette(groups) {
  if (!groups || groups.length === 0) return 'MID';
  const order = { LOW: 0, MID: 1, HIGH: 2 };

  let maxLevel = null;

  groups.forEach((g) => {
    (g.units ?? []).forEach((u) => {
      const level = u.palette ?? 'MID';
      if (maxLevel === null || (order[level] ?? 1) > (order[maxLevel] ?? 1)) {
        maxLevel = level;
      }
    });
  });

  return maxLevel ?? 'MID';
}

export default function ConditionBuilder({ conditionTree, onTreeChange, onSave, onReset, detectionError }) {
  const { groups = [], groupOperator = 'OR' } = conditionTree;

  const updateTree = (next) => {
    const palette = computeTreePalette(next.groups);
    onTreeChange({ ...next, palette });
  };

  const handleGroupChange = (idx, newGroup) => {
    const newGroups = groups.map((g, i) => i === idx ? newGroup : g);
    updateTree({ ...conditionTree, groups: newGroups });
  };

  const handleDeleteGroup = (idx) => {
    const newGroups = groups.filter((_, i) => i !== idx);
    updateTree({ ...conditionTree, groups: newGroups });
  };

  const handleAddGroup = () => {
    updateTree({ ...conditionTree, groups: [...groups, defaultGroup()] });
  };

  const handleGroupLinkOpChange = (op) => {
    updateTree({ ...conditionTree, groupOperator: op });
  };

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           '6px',
      fontFamily:    "'Pretendard', sans-serif",
    }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.81rem', color: 'var(--dark-text-muted)', letterSpacing: '0.5px' }}>
          조건 빌더
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={onSave}  style={btn(true)}>저장</button>
        <button onClick={onReset} style={btn(false)}>초기화</button>
      </div>

      {/* 빈 상태 힌트 */}
      {groups.length === 0 && (
        <div style={{
          padding:   '16px',
          textAlign: 'center',
          fontSize:  '12px',
          color:     'var(--dark-text-muted)',
        }}>
          조건을 추가하세요
        </div>
      )}

      {/* 그룹 목록 */}
      {groups.map((group, idx) => (
        <div key={idx}>
          {/* 그룹 간 연산자 */}
          {idx > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
              <select
                value={groupOperator}
                onChange={(e) => handleGroupLinkOpChange(e.target.value)}
                style={{
                  background:   'var(--dark-btn-secondary)',
                  border:       '1px solid var(--dark-input-border)',
                  borderRadius: '4px',
                  color:        'var(--dark-input-text)',
                  fontSize:     '11px',
                  padding:      '2px 6px',
                  cursor:       'pointer',
                  outline:      'none',
                  fontFamily:   "'Pretendard', sans-serif",
                }}
              >
                {GROUP_LINK_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}
          <ConditionGroup
            group={group}
            onGroupChange={(g) => handleGroupChange(idx, g)}
            onDelete={() => handleDeleteGroup(idx)}
            showDelete={groups.length > 1}
          />
        </div>
      ))}

      {/* 전체 조건 트리 한글 요약 */}
      <div style={{
        marginTop:   '4px',
        paddingTop:  '4px',
        borderTop:   '1px dashed var(--dark-input-border)',
        fontSize:    '10px',
        lineHeight:  1.4,
        color:       'var(--dark-text-muted)',
        fontFamily:  "'Pretendard', sans-serif",
      }}>
        {explainTree(conditionTree)}
      </div>

      {/* 그룹 추가 */}
      <button
        onClick={handleAddGroup}
        style={{
          alignSelf:    'flex-start',
          background:   'transparent',
          border:       '1px solid var(--dark-input-border)',
          borderRadius: '4px',
          color:        'var(--dark-text-muted)',
          fontSize:     '11px',
          padding:      '3px 10px',
          cursor:       'pointer',
          fontFamily:   "'Pretendard', sans-serif",
        }}
      >+ 그룹 추가</button>

      {/* 오류 */}
      {detectionError && (
        <div style={{ fontSize: '0.81rem', color: 'var(--dark-error)', marginTop: '2px' }}>
          {detectionError}
        </div>
      )}
    </div>
  );
}
