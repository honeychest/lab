// [AGENT] T4-ANALYSIS: 조건 한글 설명 헬퍼

function opToKoreanWord(op) {
  switch (op) {
    case 'GT':  return '초과';
    case 'GTE': return '이상';
    case 'LT':  return '미만';
    case 'LTE': return '이하';
    default:    return '';
  }
}

function paletteToKorean(palette) {
  switch (palette) {
    case 'LOW':
      return '노랑';
    case 'MID':
      return '초록';
    case 'HIGH':
      return '빨강';
    default:
      return '시각 강조 레벨';
  }
}

export function explainUnit(unit) {
  if (!unit || !unit.type) return '조건이 설정되지 않았습니다.';

  const palette = unit.palette ?? 'MID';
  const paletteText = paletteToKorean(palette);

  switch (unit.type) {
    case 'VOLUME_SPIKE': {
      if (unit.value == null || unit.value === '') {
        return `최근 20봉 평균 거래량 대비 몇 배인지 값을 입력하면, 해당 배수를 ` +
               `초과/이상/미만/이하인 봉만 매칭합니다. (${paletteText})`;
      }
      const word = opToKoreanWord(unit.op);
      return `최근 20봉 평균 거래량의 ${unit.value}배를 ${word}하는 봉 (${paletteText})`;
    }

    case 'PRICE_CHANGE': {
      if (unit.value == null || unit.value === '') {
        return `해당 봉의 시가 대비 종가의 절대 등락폭(%) 기준 값을 입력하면, ` +
               `그 이상/이하/초과/미만인 봉만 매칭합니다. (${paletteText})`;
      }
      const word = opToKoreanWord(unit.op);
      return `해당 봉의 시가 대비 종가 절대 등락폭이 ${unit.value}% ${word}인 봉 (${paletteText})`;
    }

    case 'DELTA': {
      const sign = unit.sign ?? unit.op; // UI에서 op에 POSITIVE/NEGATIVE를 넣는 경우도 대비

      if (sign === 'POSITIVE') {
        return `Delta 값이 0보다 큰 양수인 봉 (${paletteText})`;
      }
      if (sign === 'NEGATIVE') {
        return `Delta 값이 0보다 작은 음수인 봉 (${paletteText})`;
      }

      if (unit.value == null || unit.value === '') {
        return `Delta 수치를 기준으로 비교할 값과 연산자를 선택하면, 해당 조건을 만족하는 봉만 매칭합니다. (${paletteText})`;
      }
      const word = opToKoreanWord(unit.op);
      return `Delta 값이 ${unit.value}를 ${word}인 봉 (${paletteText})`;
    }

    case 'TIME_RANGE': {
      const sh = unit.startHour ?? 0;
      const sm = unit.startMinute ?? 0;
      const eh = unit.endHour ?? 23;
      const em = unit.endMinute ?? 59;

      const pad = (n) => String(n).padStart(2, '0');
      const start = `${pad(sh)}:${pad(sm)}`;
      const end   = `${pad(eh)}:${pad(em)}`;

      return `UTC 기준 ${start} ~ ${end} 사이에 위치한 봉 (${paletteText})`;
    }

    default:
      return '알 수 없는 타입의 조건입니다.';
  }
}

export function explainGroup(group, index) {
  if (!group || !group.units || group.units.length === 0) {
    return `그룹${index + 1}: 조건이 없습니다.`;
  }

  const op = group.operator ?? 'AND';
  const joinWord = op === 'OR' ? ' 또는 ' : op === 'NOT' ? ' NOT ' : ' 그리고 ';

  const unitTexts = group.units.map((u) => explainUnit(u));

  let body;
  if (op === 'NOT') {
    body = `NOT ( ${unitTexts[0] ?? '조건'} )`;
  } else {
    body = unitTexts.join(joinWord);
  }

  return `그룹${index + 1}: ${body}`;
}

export function explainTree(conditionTree) {
  if (!conditionTree || !conditionTree.groups || conditionTree.groups.length === 0) {
    return '현재 설정된 조건이 없습니다.';
  }

  const { groups, groupOperator = 'AND' } = conditionTree;
  const groupTexts = groups.map((g, idx) => explainGroup(g, idx));
  const joinWord   = groupOperator === 'OR' ? ' 또는 ' : ' 그리고 ';

  return groupTexts.join(joinWord);
}

