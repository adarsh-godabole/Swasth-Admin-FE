/** Indian 10-digit mobile starting 6–9, or E.164. Mirrors the API's rule. */
const LOCAL_MOBILE = /^[6-9]\d{9}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidPhone(value: string): boolean {
  const trimmed = value.trim();
  return LOCAL_MOBILE.test(trimmed) || E164.test(trimmed);
}

/** Strip spaces, dashes and brackets so pasted numbers validate. */
export function normalisePhone(value: string): string {
  const cleaned = value.replace(/[\s()-]/g, '');
  return cleaned.startsWith('+') ? cleaned : cleaned.replace(/\D/g, '');
}

/** `+919876543210` → `+91 98765 43210`, for display only. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FMT.format(date);
}

/** ISO timestamp → `YYYY-MM-DD` for a date input. */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/**
 * App signups who never finished onboarding have no name, so every screen goes
 * through here rather than rendering `fullName` directly.
 */
export function memberName(member: { fullName: string | null }): string {
  return member.fullName?.trim() || 'Unnamed member';
}

export function initials(fullName: string | null): string {
  if (!fullName?.trim()) return '?';
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const MONEY = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

/** `4500` → `₹4,500`. Paise are shown only when there are any. */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return MONEY.format(amount).replace(/\.00$/, '');
}

/** "5 days", "1 day", "today" — for a countdown that reads naturally. */
export function formatDayCount(days: number): string {
  const n = Math.abs(days);
  if (days === 0) return 'today';
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

const TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** `2026-08-16T13:17:59Z` → `6:47 pm`. */
export function formatTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const formatter = timeZone
    ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
    : TIME_FMT;
  return formatter.format(date).replace(/\s*([ap])\.?m\.?/i, (_, m) => ` ${m.toLowerCase()}m`);
}
