import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

/**
 * Nocturne buttons are outlined rather than filled — on a dark ground a solid
 * accent block shouts, and the desk screens already carry one accent panel
 * each. Weight comes from the border and the label colour.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'border-indigo-600 text-indigo-600 hover:bg-indigo-600/12 active:bg-indigo-600/22',
  secondary: 'border-slate-300 text-slate-700 hover:bg-slate-900/7 active:bg-slate-900/14',
  danger: 'border-red-500 text-red-700 hover:bg-red-500/14 active:bg-red-500/24',
  ghost: 'border-transparent text-indigo-600 hover:bg-indigo-600/10 active:bg-indigo-600/18',
};

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-[13px]',
  md: 'px-3.5 py-1.5 text-sm',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

/** A square button carrying only an icon — day steppers, pagination, overflow. */
export function IconButton({
  icon,
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-indigo-600 transition-colors hover:bg-indigo-600/10 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${className}`}
      {...rest}
    >
      <i className={`ph ph-${icon} text-base`} aria-hidden="true" />
    </button>
  );
}
