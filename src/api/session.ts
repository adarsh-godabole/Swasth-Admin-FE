import type { AuthGym, AuthUser } from './types';

/**
 * Persisted session. Kept outside React so the API client can read tokens
 * synchronously during a request, and so a refresh-token rotation is visible
 * to every in-flight caller at once.
 */

const KEY = 'swasth.admin.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
  gym: AuthGym;
}

type Listener = (session: Session | null) => void;

let current: Session | null = read();
const listeners = new Set<Listener>();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

function emit() {
  for (const listener of listeners) listener(current);
}

export const session = {
  get(): Session | null {
    return current;
  },

  set(next: Session): void {
    current = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private-mode / quota failure: keep the in-memory session working.
    }
    emit();
  },

  /** Replace both tokens after a refresh — they rotate together. */
  setTokens(accessToken: string, refreshToken: string): void {
    if (!current) return;
    session.set({ ...current, accessToken, refreshToken });
  },

  clear(): void {
    current = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    emit();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Keep multiple tabs in step: a logout or token rotation in one tab applies here.
window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  current = read();
  emit();
});
