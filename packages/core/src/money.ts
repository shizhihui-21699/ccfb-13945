/** 分转元、求和等全部以"分"为整数运算，杜绝浮点误差。 */

export function yuanToCents(yuan: string): number {
  const m = /^(\d+)\.(\d{1,2})$|^(\d+)$/.exec(yuan.trim());
  if (!m) throw new Error(`非法金额: ${yuan}`);
  const whole = m[1] ?? m[3] ?? '0';
  const frac = (m[2] ?? '').padEnd(2, '0');
  return Number(whole) * 100 + Number(frac);
}

export function centsToYuan(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function sumYuan(amounts: string[]): string {
  return centsToYuan(amounts.reduce((acc, a) => acc + yuanToCents(a), 0));
}

/** 两个金额之差：a - b，返回字符串。 */
export function diffYuan(a: string, b: string): string {
  return centsToYuan(yuanToCents(a) - yuanToCents(b));
}

/** 账号四位分组显示，便于逐位核对。 */
export function groupAccount(account: string): string {
  return account.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** 高亮两个账号的差异位（返回带 * 标记的分段，供 UI 渲染）。 */
export function diffAccountPositions(a: string, b: string): number[] {
  const out: number[] = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) out.push(i);
  }
  return out;
}
