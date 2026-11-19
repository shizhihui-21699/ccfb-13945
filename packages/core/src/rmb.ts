import { yuanToCents, centsToYuan } from './money.js';

const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const SMALL_UNITS = ['', '拾', '佰', '仟'];
const BIG_UNITS = ['', '万', '亿', '万亿'];

/** 四位以内整数段转大写。 */
function fourDigitToChinese(n: number): string {
  let result = '';
  let zeroPending = false;
  const digits = String(n).padStart(4, '0');
  for (let i = 0; i < 4; i++) {
    const d = Number(digits[i] ?? 0);
    const unit = SMALL_UNITS[3 - i] ?? '';
    if (d === 0) {
      zeroPending = result !== '';
    } else {
      if (zeroPending) result += '零';
      zeroPending = false;
      result += DIGITS[d] + unit;
    }
  }
  return result;
}

/**
 * 人民币金额大写，例如 1234.56 → 壹仟贰佰叁拾肆元伍角陆分。
 * 银行票据标准写法，手机确认页与纸质凭证一致，降低被"形似金额"蒙骗的可能。
 */
export function rmbUpper(amount: string): string {
  const cents = yuanToCents(amount);
  if (cents === 0) return '零元整';
  const yuan = Math.floor(Math.abs(cents) / 100);
  const jiao = Math.floor((Math.abs(cents) % 100) / 10);
  const fen = Math.abs(cents) % 10;

  let integerPart = '';
  if (yuan === 0) {
    integerPart = '零元';
  } else if (yuan > 0) {
    const groups: number[] = [];
    let rest = yuan;
    while (rest > 0) {
      groups.push(rest % 10000);
      rest = Math.floor(rest / 10000);
    }
    let pendingZero = false;
    for (let g = groups.length - 1; g >= 0; g--) {
      const section = groups[g]!;
      if (section === 0) {
        pendingZero = integerPart !== '';
        continue;
      }
      if (pendingZero || (integerPart !== '' && section < 1000)) integerPart += '零';
      pendingZero = false;
      integerPart += fourDigitToChinese(section) + BIG_UNITS[g];
    }
    integerPart += '元';
  }

  let decimalPart = '';
  if (jiao === 0 && fen === 0) {
    decimalPart = '整';
  } else {
    if (jiao > 0) decimalPart += DIGITS[jiao] + '角';
    else if (integerPart !== '') decimalPart += '零';
    if (fen > 0) decimalPart += DIGITS[fen] + '分';
    else decimalPart += '整';
  }

  return `${cents < 0 ? '负' : ''}${integerPart}${decimalPart}`;
}

/** 金额变动的人读描述，例如 +1,200.00（+12.5%）。 */
export function describeDelta(current: string, last: string): string {
  const cur = yuanToCents(current);
  const prev = yuanToCents(last);
  const delta = cur - prev;
  const pct = prev === 0 ? null : Math.round((delta / prev) * 1000) / 10;
  const sign = delta > 0 ? '+' : delta < 0 ? '' : '±';
  const pctText = pct === null ? '新增' : `（${sign}${pct}%）`;
  return `${sign}${centsToYuan(delta)} ${pctText}`;
}
