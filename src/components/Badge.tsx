import type { ReactNode } from 'react';
import type { GymUserStatus } from '../api/types';
import { STATUS_LABELS } from '../api/types';

const TONES = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
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
