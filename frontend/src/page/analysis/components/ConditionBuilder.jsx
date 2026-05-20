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
    <div className="analysis-cb">
      {/* 헤더 */}
      <div className="analysis-cb__header">
        <span className="analysis-cb__header-title">조건 빌더</span>
        <div className="analysis-cb__header-spacer" />
        <button onClick={onSave}  className="analysis-btn analysis-btn--primary">저장</button>
        <button onClick={onReset} className="analysis-btn">초기화</button>
      </div>

      {/* 빈 상태 힌트 */}
      {groups.length === 0 && (
        <div className="analysis-cb__empty">조건을 추가하세요</div>
      )}

      {/* 그룹 목록 */}
      {groups.map((group, idx) => (
        <div key={idx}>
          {/* 그룹 간 연산자 */}
          {idx > 0 && (
            <div className="analysis-cb__group-link">
              <select
                className="analysis-select analysis-select--group-link"
                value={groupOperator}
                onChange={(e) => handleGroupLinkOpChange(e.target.value)}
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
      <div className="analysis-cb__summary">
        {explainTree(conditionTree)}
      </div>

      {/* 그룹 추가 */}
      <button
        onClick={handleAddGroup}
        className="analysis-btn--ghost analysis-cb__add-group"
      >+ 그룹 추가</button>

      {/* 오류 */}
      {detectionError && (
        <div className="analysis-cb__error">{detectionError}</div>
      )}
    </div>
  );
}
