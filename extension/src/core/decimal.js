// 정수 스케일 십진 연산.
//
// 부동소수로 floor(a / step) 을 하면 경계에서 한 단위 틀린다
// (0.1 * 3 === 0.30000000000000004). 그 값이 그대로 주문 수량이 되면
// 바이낸스가 LOT_SIZE 필터로 거부한다. 그래서 가격·수량 양자화는
// 전부 BigInt 정수 연산으로만 한다.
//
// 모든 값은 10^18 배로 스케일된 BigInt 다.

export const SCALE = 18;
const ONE = 10n ** 18n;

export function fromString(input) {
    if (typeof input === 'number') return fromNumber(input);
    if (typeof input === 'bigint') return input;
    const str = String(input).trim();
    if (!/^-?\d+(\.\d+)?$/.test(str)) {
        throw new Error(`십진수로 읽을 수 없습니다: ${input}`);
    }
    const negative = str.startsWith('-');
    const body = negative ? str.slice(1) : str;
    const [intPart, fracPart = ''] = body.split('.');
    const frac = (fracPart + '0'.repeat(SCALE)).slice(0, SCALE);
    const value = BigInt(intPart) * ONE + BigInt(frac);
    return negative ? -value : value;
}

export function fromNumber(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
        throw new Error(`유한한 숫자가 아닙니다: ${n}`);
    }
    let str = String(n);
    if (str.includes('e') || str.includes('E')) str = n.toFixed(SCALE);
    return fromString(str);
}

export function mul(a, b) {
    return (a * b) / ONE;
}

export function div(a, b) {
    if (b === 0n) throw new Error('0 으로 나눌 수 없습니다');
    return (a * ONE) / b;
}

export function pow(base, exponent) {
    if (!Number.isInteger(exponent) || exponent < 0) {
        throw new Error(`지수는 0 이상의 정수여야 합니다: ${exponent}`);
    }
    let result = ONE;
    for (let i = 0; i < exponent; i += 1) result = mul(result, base);
    return result;
}

// step 의 배수로 내림. 양수만 다룬다(가격·수량은 음수가 될 수 없다).
export function floorToStep(value, step) {
    requirePositiveStep(step);
    if (value < 0n) throw new Error('음수는 양자화하지 않습니다');
    return (value / step) * step;
}

// step 의 배수로 올림.
export function ceilToStep(value, step) {
    requirePositiveStep(step);
    if (value < 0n) throw new Error('음수는 양자화하지 않습니다');
    const floored = (value / step) * step;
    return floored === value ? value : floored + step;
}

export function isMultipleOf(value, step) {
    requirePositiveStep(step);
    return value % step === 0n;
}

// "0.001" -> 3.  주문 파라미터를 만들 때 쓸 소수 자릿수.
export function decimalsOf(stepInput) {
    const str = String(stepInput).trim();
    if (!/^\d+(\.\d+)?$/.test(str)) {
        throw new Error(`단위로 읽을 수 없습니다: ${stepInput}`);
    }
    const [, frac = ''] = str.split('.');
    const trimmed = frac.replace(/0+$/, '');
    return trimmed.length;
}

// 고정 소수 자릿수 문자열. value 가 이미 그 자릿수의 배수라는 전제.
export function format(value, decimals) {
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const intPart = abs / ONE;
    const fracPart = abs % ONE;
    const fracStr = fracPart.toString().padStart(SCALE, '0').slice(0, decimals);
    const sign = negative ? '-' : '';
    return decimals > 0 ? `${sign}${intPart}.${fracStr}` : `${sign}${intPart}`;
}

// 표시 전용. 계산에 다시 쓰지 않는다.
export function toNumber(value) {
    return Number(format(value, 8));
}

function requirePositiveStep(step) {
    if (typeof step !== 'bigint' || step <= 0n) {
        throw new Error('단위는 0보다 커야 합니다');
    }
}
