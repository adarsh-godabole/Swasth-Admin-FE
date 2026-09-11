import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gyms } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { ROLE_LABELS } from '../api/types';
import { useExpiringSubscriptions } from '../members/planQueries';
import { initials } from '../lib/format';

/**
 * The rail replaces the old top bar. Five destinations is more than a header
 * row wants to carry, and the vertical list has room for the counts that make
 * the nav worth glancing at — Renewals says how many calls are waiting.
 */
const NAV = [
  { to: '/desk', label: 'Desk', icon: 'door-open' },
  { to: '/members', label: 'Members', icon: 'users' },
  { to: '/renewals', label: 'Renewals', icon: 'phone-outgoing' },
  { to: '/plans', label: 'Plans', icon: 'tag' },
  { to: '/insights', label: 'Insights', icon: 'chart-bar' },
];

export function AppLayout() {
  const { user, gym, signOut } = useAuth();
  const navigate = useNavigate();

  const gymQuery = useQuery({
    queryKey: ['gym', 'current'],
    queryFn: gyms.current,
    staleTime: 10 * 60 * 1000,
  });

  // Shares a cache key with the Renewals page, so the badge costs nothing
  // once that screen has been opened — and warms it when it hasn't.
  const dueQuery = useExpiringSubscriptions(7);
  const dueCount = dueQuery.data?.length ?? 0;

  const gymName = gymQuery.data?.name ?? gym?.name ?? 'Swasth Admin';
  const logoUrl = gymQuery.data?.logoUrl;

  return (
    <div className="flex h-full overflow-hidden">
      <aside
        className="flex w-57 shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-200 px-3 py-4.5"
        style={{ background: 'linear-gradient(180deg, #1a1c2b, var(--color-bg))' }}
      >
        <div className="flex items-center gap-2.5 px-1">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="size-7.5 rounded-md object-cover" />
          ) : (
            <div
              className="flex size-7.5 items-center justify-center rounded-md text-sm text-indigo-700"
              style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent-700)' }}
            >
              S
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-slate-900">{gymName}</p>
            <p className="text-[11px] text-slate-500">Front desk</p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sq-nav ${isActive ? 'sq-nav-on' : ''}`}
            >
              {({ isActive }) => (
                <>
                  <i
                    className={`${isActive ? 'ph-fill' : 'ph'} ph-${item.icon} text-base`}
                    aria-hidden="true"
                  />
                  {item.label}
                  {item.to === '/renewals' && dueCount > 0 && (
                    <span className="tnum ml-auto text-[11px] text-indigo-700">{dueCount}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/members/new')}
            className="flex w-full items-center gap-2 rounded-md border border-indigo-600 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-600/12"
          >
            <i className="ph ph-user-plus text-[15px]" aria-hidden="true" />
            Register member
          </button>

          <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
            <div className="flex size-6.5 items-center justify-center rounded-full bg-indigo-50 text-[11px] text-indigo-800">
              {initials(user?.fullName ?? null) || <i className="ph ph-user" aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-slate-900">{user?.fullName ?? user?.phone}</p>
              <p className="text-[11px] text-slate-500">{user ? ROLE_LABELS[user.role] : ''}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            >
              <i className="ph ph-sign-out text-[15px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-7 pt-6 pb-8">
        <Outlet />
      </main>
    </div>
  );
}
