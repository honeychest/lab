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
    <div style={{
      border:       '1px dashed var(--dark-input-border)',
      borderRadius: '6px',
      padding:      '8px',
      display:      'flex',
      flexDirection: 'column',
      gap:          '6px',
    }}>
      {/* 그룹 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--dark-text-muted)', fontFamily: "'Pretendard', sans-serif" }}>
          그룹
        </span>
        <select
          value={group.operator ?? 'AND'}
          onChange={(e) => onGroupChange({ ...group, operator: e.target.value })}
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
          {GROUP_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {showDelete && (
          <button
            onClick={onDelete}
            style={{
              background:  'transparent',
              border:      'none',
              color:       'var(--dark-text-muted)',
              cursor:      'pointer',
              fontSize:    '11px',
              padding:     '2px 4px',
              fontFamily:  "'Pretendard', sans-serif",
            }}
          >그룹 삭제</button>
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
      <button
        onClick={handleAddUnit}
        style={{
          alignSelf:    'flex-start',
          background:   'transparent',
          border:       '1px solid var(--dark-input-border)',
          borderRadius: '4px',
          color:        'var(--dark-text-muted)',
          fontSize:     '11px',
          padding:      '3px 8px',
          cursor:       'pointer',
          fontFamily:   "'Pretendard', sans-serif",
        }}
      >+ 조건 추가</button>
    </div>
  );
}
