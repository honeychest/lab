import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
// ── 포맷 유틸 ──────────────────────────────────────────────────
/** 숫자를 입력받아 천 단위 콤마 포맷. null/undefined/빈문자열/NaN 등 예외 처리 */
const formatWithComma = (v) => {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 20 });
};