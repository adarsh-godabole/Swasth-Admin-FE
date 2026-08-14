import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { ROLE_LABELS } from '../api/types';

/**
 * Shown when someone with a valid session lacks a staff role. Every member API
 * call would 403, so we never let them into the app shell.
 */
export function NotStaffPage() {
  const { user, gym, signOut } = useAuth();

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">This portal is for gym staff</h1>
        <p className="mt-2 text-sm text-slate-600">
          You're signed in as{' '}
          <span className="font-medium text-slate-900">{user?.fullName ?? user?.phone}</span>
          {user && (
            <>
              , whose role at {gym?.name ?? 'this gym'} is{' '}
              <span className="font-medium text-slate-900">{ROLE_LABELS[user.role]}</span>
            </>
          )}
          . Only gym admins and owners can manage members here.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          If you're a member, use the Swasth mobile app instead.
        </p>
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
