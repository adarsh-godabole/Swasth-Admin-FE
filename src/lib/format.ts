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
