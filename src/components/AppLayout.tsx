import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gyms } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABELS } from '../api/types';
import { Button } from './Button';

export function AppLayout() {
  const { user, gym, signOut } = useAuth();

  const gymQuery = useQuery({
    queryKey: ['gym', 'current'],
    queryFn: gyms.current,
    staleTime: 10 * 60 * 1000,
  });

  const gymName = gymQuery.data?.name ?? gym?.name ?? 'Swasth Admin';
  const logoUrl = gymQuery.data?.logoUrl;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="size-9 rounded-md object-cover" />
          ) : (
            <div className="flex size-9 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">
              S
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{gymName}</p>
            <p className="text-xs text-slate-500">Member management</p>
          </div>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/members"
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium ${
                  isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              Members
            </NavLink>
          </nav>

          <div className="ml-2 flex items-center gap-3 border-l border-slate-200 pl-4">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-800">{user?.fullName ?? user?.phone}</p>
              <p className="text-xs text-slate-500">{user ? ROLE_LABELS[user.role] : ''}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
