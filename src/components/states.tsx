import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { Button } from './Button';
import { Spinner } from './Spinner';

export function WakingServerNotice() {
  return (
    <p className="text-sm text-slate-500">
      Waking the server up… the first request after a quiet spell can take up to a minute.
    </p>
  );
}

export function LoadingBlock({ label, slow = false }: { label: string; slow?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center" role="status">
      <Spinner className="size-6 text-indigo-600" />
      <p className="text-sm text-slate-600">{label}</p>
      {slow && <WakingServerNotice />}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Renders the backend's own `message` — it is written to be shown to staff, so
 * it is never replaced with a generic "something went wrong".
 */
export function ErrorState({
  error,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="px-6 py-16 text-center" role="alert">
      <p className="text-sm font-medium text-red-700">{errorMessage(error)}</p>
      {error instanceof ApiError && error.errors && error.errors.length > 0 && (
        <ul className="mx-auto mt-2 inline-block list-disc text-left text-sm text-slate-600">
          {error.errors.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}

export function errorDetails(error: unknown): string[] | undefined {
  return error instanceof ApiError ? error.errors : undefined;
}
