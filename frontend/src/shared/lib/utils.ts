import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
/** 숫자를 입력받아 천 단위 콤마 포맷 */
export const formatWithComma = (v : number) => {
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { maximumFractionDigits: 20 });
};