import type { Tone } from '../components/Badge';
import { formatDate, formatDayCount } from '../lib/format';
import type { MemberMembership, Subscription, SubscriptionStatus } from '../api/types';

/**
 * How a membership reads at a glance. `daysRemaining` is 0 on the last valid day
 * and negative once past, so "expires today" and "expired 3 days ago" are
 * different states and both matter at the desk.
 */
export interface MembershipSummary {
  label: string;
  tone: Tone;
  /** Secondary line, e.g. the expiry date or the renewal already queued. */
  detail?: string;
}

/** Anything expiring within this many days is worth chasing. */
export const EXPIRING_SOON_DAYS = 7;

export function summariseMembership(
  membership: MemberMembership | null,
): MembershipSummary {
  if (!membership) {
    return { label: 'No membership', tone: 'slate', detail: 'Never bought a plan' };
  }

  const { status, planName, daysRemaining, hasRenewalQueued } = membership;

  if (status === 'CANCELLED') {
    return { label: `${planName} · cancelled`, tone: 'slate' };
  }

  if (status === 'UPCOMING') {
    return {
      label: `${planName} · from ${formatDate(membership.startDate)}`,
      tone: 'indigo',
      detail: 'Not active yet',
    };
  }

  if (status === 'EXPIRED' || daysRemaining < 0) {
    return {
      label: `${planName} · expired`,
      tone: 'red',
      detail: `Ran out ${formatDayCount(daysRemaining)} ago`,
    };
  }

  const detail = hasRenewalQueued ? 'Renewal already queued' : undefined;

  if (daysRemaining === 0) return { label: `${planName} · ends today`, tone: 'amber', detail };
  if (daysRemaining <= EXPIRING_SOON_DAYS) {
    return { label: `${planName} · ${formatDayCount(daysRemaining)} left`, tone: 'amber', detail };
  }
  return { label: `${planName} · ${formatDayCount(daysRemaining)} left`, tone: 'green', detail };
}

export const SUBSCRIPTION_TONES: Record<SubscriptionStatus, Tone> = {
  ACTIVE: 'green',
  UPCOMING: 'indigo',
  EXPIRED: 'slate',
  CANCELLED: 'slate',
};

/** A subscription can only be cancelled while it still has time left to give back. */
export function isCancellable(subscription: Subscription): boolean {
  return subscription.status === 'ACTIVE' || subscription.status === 'UPCOMING';
}

/** Only a live membership with money owing is worth collecting against. */
export function canTakePayment(subscription: Subscription): boolean {
  return subscription.balance > 0 && subscription.status !== 'CANCELLED';
}

/**
 * How far through the term a membership is, as a percentage. The redesign
 * shows this as a countdown bar instead of a second badge — a full bar in
 * warning colour says "about to run out" faster than any wording does.
 */
export interface MembershipProgress {
  /** 0–100. Clamped, so an over-run membership still renders a full bar. */
  percent: number;
  tone: 'ok' | 'warn' | 'bad';
}

export function membershipProgress(
  membership: MemberMembership | null,
): MembershipProgress | null {
  if (!membership) return null;
  if (membership.status === 'CANCELLED' || membership.status === 'UPCOMING') return null;

  const start = Date.parse(membership.startDate);
  const end = Date.parse(membership.endDate);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;

  const elapsed = (Date.now() - start) / (end - start);
  const percent = Math.min(100, Math.max(0, Math.round(elapsed * 100)));

  const { daysRemaining } = membership;
  const tone = daysRemaining < 0 || daysRemaining === 0 ? 'bad' : daysRemaining <= EXPIRING_SOON_DAYS ? 'warn' : 'ok';

  return { percent, tone };
}
