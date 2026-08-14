import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../api/endpoints';
import { session } from '../api/session';
import type { Session } from '../api/session';
import { STAFF_ROLES } from '../api/types';
import type { AuthGym, AuthUser, OtpVerifyResponse } from '../api/types';

interface AuthContextValue {
  session: Session | null;
  user: AuthUser | null;
  gym: AuthGym | null;
  isAuthenticated: boolean;
  /** Only GYM_ADMIN and OWNER may use this portal. */
  isStaff: boolean;
  signIn: (result: OtpVerifyResponse) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function subscribe(onChange: () => void) {
  return session.subscribe(onChange);
}

function getSnapshot() {
  return session.get();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const queryClient = useQueryClient();

  const signIn = useCallback((result: OtpVerifyResponse) => {
    session.set({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
      gym: result.gym,
    });
  }, []);

  const signOut = useCallback(() => {
    const refreshToken = session.get()?.refreshToken;
    // Never block logout on the network — clear locally either way.
    session.clear();
    queryClient.clear();
    if (refreshToken) {
      auth.logout(refreshToken).catch(() => {
        /* the local session is already gone */
      });
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session: current,
      user: current?.user ?? null,
      gym: current?.gym ?? null,
      isAuthenticated: Boolean(current),
      isStaff: Boolean(current && STAFF_ROLES.includes(current.user.role)),
      signIn,
      signOut,
    }),
    [current, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
