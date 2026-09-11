import type { ReactNode } from 'react';
import type { GymUserStatus } from '../api/types';
import { STATUS_LABELS } from '../api/types';

/**
 * Nocturne states a status as a dot plus a phrase — the dot carries the colour
 * so the text stays legible, and nothing depends on hue alone.
 */
const TONES = {
  green: { pill: 'pill-ok', dot: 'var(--ok)' },
  amber: { pill: 'pill-warn', dot: 'var(--warn)' },
  red: { pill: 'pill-bad', dot: 'var(--bad)' },
  indigo: { pill: 'pill-accent', dot: 'var(--color-accent-400)' },
  slate: { pill: 'pill-neutral', dot: 'var(--color-neutral-600)' },
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  tone = 'slate',
  dot = true,
  children,
}: {
  tone?: Tone;
  /** Off for badges that are already a label rather than a state. */
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`pill ${TONES[tone].pill}`}>
      {dot && <span className="dot" style={{ background: TONES[tone].dot }} />}
      {children}
    </span>
  );
}

const STATUS_TONES: Record<GymUserStatus, Tone> = {
  ACTIVE: 'green',
  SUSPENDED: 'amber',
  LEFT: 'slate',
};

export function StatusBadge({ status }: { status: GymUserStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** A flat label with no state reading — the check-in source, a plan's reach. */
export function Tag({ tone = 'neutral', children }: { tone?: 'accent' | 'neutral'; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
