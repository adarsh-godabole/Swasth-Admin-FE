import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Per-field validation strings from the API's `errors` array. */
  details?: string[];
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string, details?: string[]) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONES: Record<ToastTone, string> = {
  success: 'bg-white ring-emerald-200 text-slate-800',
  error: 'bg-white ring-red-300 text-slate-800',
  info: 'bg-white ring-slate-300 text-slate-800',
};

const ACCENTS: Record<ToastTone, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-slate-400',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string, details?: string[]) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message, details }]);
      // Errors stay longer — staff need time to read the backend's message.
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message, details) => push('error', message, details),
      info: (message) => push('info', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex overflow-hidden rounded-lg shadow-lg ring-1 ${TONES[toast.tone]}`}
          >
            <div className={`w-1 shrink-0 ${ACCENTS[toast.tone]}`} />
            <div className="flex-1 px-3 py-2.5 text-sm">
              <p>{toast.message}</p>
              {toast.details && toast.details.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                  {toast.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="px-3 text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
