// [AGENT] T4-ANALYSIS: 개별 조건 행 — 타입/비교연산자/값/팔레트/삭제 + 한글 설명
import { PALETTE_LEVELS } from '../palette.js';
import { explainUnit } from '../engine/conditionExplain.js';

const CONDITION_TYPES = [
  { value: 'VOLUME_SPIKE', label: '거래량 스파이크' },
  { value: 'PRICE_CHANGE', label: '가격변화율'      },
  { value: 'DELTA',        label: 'Delta'           },
  { value: 'TIME_RANGE',   label: '시간대'           },
];

const OP_OPTIONS = {
  VOLUME_SPIKE: [
    { value: 'GT',  label: '>'  },
    { value: 'GTE', label: '>=' },
    { value: 'LT',  label: '<'  },
    { value: 'LTE', label: '<=' },
  ],
  PRICE_CHANGE: [
    { value: 'GT',  label: '>'  },
    { value: 'GTE', label: '>=' },
    { value: 'LT',  label: '<'  },
    { value: 'LTE', label: '<=' },
  ],
  DELTA: [
    { value: 'POSITIVE', label: '양수 (>0)' },
    { value: 'NEGATIVE', label: '음수 (<0)' },
    { value: 'GT',       label: '>'         },
    { value: 'GTE',      label: '>='        },
    { value: 'LT',       label: '<'         },
    { value: 'LTE',      label: '<='        },
  ],
  TIME_RANGE: [],
};

const UNIT_OPERATORS = ['AND', 'OR', 'NOT'];

const sel = {
  background:  'rgba(255,255,255,0.06)',
  border:      '1px solid rgba(255,255,255,0.12)',
  borderRadius: '4px',
  color:       'rgba(255,255,255,0.8)',
  fontSize:    '11px',
  padding:     '3px 6px',
  cursor:      'pointer',
  outline:     'none',
  fontFamily:  "'Pretendard', sans-serif",
};

const inp = {
  ...sel,
  width: '72px',
  textAlign: 'center',
};

export default function ConditionRow({ unit, rowIndex, operator, onUnitChange, onOperatorChange, onDelete }) {
  const isDeltaSign = unit.type === 'DELTA' && (unit.op === 'POSITIVE' || unit.op === 'NEGATIVE');
  const isTimeRange = unit.type === 'TIME_RANGE';

  const handleTypeChange = (type) => {
    const defaultOps = { VOLUME_SPIKE: 'GT', PRICE_CHANGE: 'GT', DELTA: 'POSITIVE', TIME_RANGE: null };
    onUnitChange({ type, op: defaultOps[type], value: '', startHour: 0, startMinute: 0, endHour: 23, endMinute: 59 });
  };

  const handleOpChange = (op) => {
    onUnitChange({ ...unit, op, value: '' });
  };

  const description = explainUnit(unit);

  return (
    <div style={{
      display:      'flex',
      alignItems:   'flex-start',
      gap:          '8px',
      fontFamily:   "'Pretendard', sans-serif",
    }}>
      {/* 왼쪽: 컨트롤들 (내용만큼, auto) */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '6px',
        flexWrap:     'wrap',
        minWidth:     0,
      }}>
        {/* 연산자 (첫 행 제외) */}
        {rowIndex > 0 && (
          <select value={operator} onChange={(e) => onOperatorChange(e.target.value)} style={sel}>
            {UNIT_OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )}

        {/* 조건 타입 */}
        <select value={unit.type} onChange={(e) => handleTypeChange(e.target.value)} style={sel}>
          {CONDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>

        {/* 비교 연산자 / 값 */}
        {isTimeRange ? (
          <>
            <input
              type="number" min={0} max={23} value={unit.startHour ?? 0}
              onChange={(e) => onUnitChange({ ...unit, startHour: Number(e.target.value) })}
              style={{ ...inp, width: '48px' }} placeholder="시"
            />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.81rem' }}>:</span>
            <input
              type="number" min={0} max={59} value={unit.startMinute ?? 0}
              onChange={(e) => onUnitChange({ ...unit, startMinute: Number(e.target.value) })}
              style={{ ...inp, width: '48px' }} placeholder="분"
            />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.81rem' }}>~</span>
            <input
              type="number" min={0} max={23} value={unit.endHour ?? 23}
              onChange={(e) => onUnitChange({ ...unit, endHour: Number(e.target.value) })}
              style={{ ...inp, width: '48px' }} placeholder="시"
            />
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.81rem' }}>:</span>
            <input
              type="number" min={0} max={59} value={unit.endMinute ?? 59}
              onChange={(e) => onUnitChange({ ...unit, endMinute: Number(e.target.value) })}
              style={{ ...inp, width: '48px' }} placeholder="분"
            />
          </>
        ) : (
          <>
            <select value={unit.op ?? ''} onChange={(e) => handleOpChange(e.target.value)} style={sel}>
              {(OP_OPTIONS[unit.type] ?? []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {!isDeltaSign && (
              <input
                type="number"
                value={unit.value ?? ''}
                onChange={(e) => onUnitChange({ ...unit, value: e.target.value === '' ? '' : Number(e.target.value) })}
                style={inp}
                placeholder="값"
              />
            )}
          </>
        )}

        {/* 팔레트 */}
        <select
          value={unit.palette ?? 'MID'}
          onChange={(e) => onUnitChange({ ...unit, palette: e.target.value })}
          style={sel}
        >
          {PALETTE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* 가운데: 조건 한글 설명 (나머지 전체, 좌측 정렬, 세로 가운데 정렬 느낌) */}
      <div style={{
        fontSize:     '13px',
        color:        'rgba(255,255,255,0.75)',
        flex:         1,
        minWidth:     80,
        whiteSpace:   'nowrap',
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        textAlign:    'left',
        display:      'flex',
        alignItems:   'center',
      }}>
        <span>{description}</span>
      </div>

      {/* 오른쪽: 삭제 버튼 */}
      <button
        onClick={onDelete}
        style={{
          background:   'transparent',
          border:       'none',
          color:        'rgba(255,255,255,0.7)',
          cursor:       'pointer',
          fontSize:     '16px',
          padding:      '2px 4px',
          lineHeight:   1,
          flexShrink:   0,
        }}
      >×</button>
    </div>
  );
}
