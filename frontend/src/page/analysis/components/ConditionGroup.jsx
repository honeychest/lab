// [AGENT] T4-ANALYSIS: 조건 그룹 블록 — dashed border + units 행 목록
import ConditionRow from './ConditionRow.jsx';

const GROUP_OPERATORS = ['AND', 'OR', 'NOT'];

function defaultUnit() {
  return { type: 'VOLUME_SPIKE', op: 'GT', value: 2, palette: 'MID' };
}

export default function ConditionGroup({ group, onGroupChange, onDelete, showDelete }) {
  const handleUnitChange = (idx, newUnit) => {
    const units = group.units.map((u, i) => i === idx ? newUnit : u);
    onGroupChange({ ...group, units });
  };

  const handleOperatorChange = (idx, op) => {
    const operators = [...(group.unitOperators ?? [])];
    operators[idx - 1] = op;
    onGroupChange({ ...group, unitOperators: operators });
  };

  const handleAddUnit = () => {
    const units     = [...group.units, defaultUnit()];
    const operators = [...(group.unitOperators ?? []), 'AND'];
    onGroupChange({ ...group, units, unitOperators: operators });
  };

  const handleDeleteUnit = (idx) => {
    const units     = group.units.filter((_, i) => i !== idx);
    const operators = (group.unitOperators ?? []).filter((_, i) => i !== idx - 1);
    onGroupChange({ ...group, units, unitOperators: operators });
  };

  return (
    <div className="analysis-cg">
      {/* 그룹 헤더 */}
      <div className="analysis-cg__header">
        <span className="analysis-cg__title">그룹</span>
        <select
          className="analysis-select analysis-select--group-link"
          value={group.operator ?? 'AND'}
          onChange={(e) => onGroupChange({ ...group, operator: e.target.value })}
        >
          {GROUP_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="analysis-cg__spacer" />
        {showDelete && (
          <button onClick={onDelete} className="analysis-btn--text">그룹 삭제</button>
        )}
      </div>

      {/* 조건 행 목록 */}
      {group.units.map((unit, idx) => (
        <ConditionRow
          key={idx}
          unit={unit}
          rowIndex={idx}
          operator={(group.unitOperators ?? [])[idx - 1] ?? 'AND'}
          onUnitChange={(u) => handleUnitChange(idx, u)}
          onOperatorChange={(op) => handleOperatorChange(idx, op)}
          onDelete={() => handleDeleteUnit(idx)}
        />
      ))}

      {/* 조건 추가 */}
      <button onClick={handleAddUnit} className="analysis-btn--ghost analysis-cg__add-unit">+ 조건 추가</button>
    </div>
  );
}
