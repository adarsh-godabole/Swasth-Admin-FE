import type { ComponentPropsWithRef, ReactNode } from 'react';
import { useId } from 'react';

const CONTROL =
  'block w-full rounded-md bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 disabled:bg-slate-50 disabled:text-slate-500';
const INVALID = 'ring-red-400 focus:ring-red-500';

interface WrapProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

function Wrap({ label, error, hint, required, children }: WrapProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-red-600" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <div className="mt-1">{children({ id, describedBy, invalid: Boolean(error) })}</div>
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

type FieldExtras = { label: string; error?: string; hint?: ReactNode };

export function TextField({
  label,
  error,
  hint,
  required,
  ...rest
}: FieldExtras & ComponentPropsWithRef<'input'>) {
  return (
    <Wrap label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? INVALID : ''}`}
          {...rest}
        />
      )}
    </Wrap>
  );
}

export function SelectField({
  label,
  error,
  hint,
  required,
  children,
  ...rest
}: FieldExtras & ComponentPropsWithRef<'select'>) {
  return (
    <Wrap label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? INVALID : ''}`}
          {...rest}
        >
          {children}
        </select>
      )}
    </Wrap>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  required,
  ...rest
}: FieldExtras & ComponentPropsWithRef<'textarea'>) {
  return (
    <Wrap label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={3}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? INVALID : ''}`}
          {...rest}
        />
      )}
    </Wrap>
  );
}
