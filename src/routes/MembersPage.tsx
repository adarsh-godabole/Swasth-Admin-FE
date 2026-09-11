import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, IconButton } from '../components/Button';
import { EmptyState, ErrorState, LoadingBlock } from '../components/states';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatDate, formatMoney, formatPhone, memberName } from '../lib/format';
import { useMemberList } from '../members/queries';
import { useMemberStats } from '../members/insightQueries';
import { STATUS_LABELS } from '../api/types';
import type {
  GymUserStatus,
  Member,
  MemberSortBy,
  MembershipFilter,
  MemberListParams,
  MemberStats,
  SortOrder,
} from '../api/types';
import { membershipProgress, summariseMembership } from '../members/membership';

const PAGE_SIZE = 20;

/**
 * The list mixes two populations: people who have actually bought a plan, and
 * anyone who merely logged into the mobile app and was auto-linked to the gym.
 * Splitting on `membershipStatus` rather than `source` is the cleaner divide —
 * it separates paying members from people who have never bought anything,
 * however they arrived.
 *
 * There is no "Everyone" filter: everyone is what the list shows when nothing
 * is selected. The entries below narrow it down, and each one toggles off back
 * to the full list.
 */
type View = 'ALL' | MembershipFilter;

/** The unfiltered list — the default, and never a button in the filter row. */
const ALL_VIEW = { id: 'ALL' as const, blurb: 'Every person linked to this gym.' };

const FILTERS: { id: MembershipFilter; label: string; blurb: string }[] = [
  {
    id: 'ACTIVE',
    label: 'Active',
    blurb: 'Paid up with time left on their membership.',
  },
  {
    id: 'EXPIRING',
    label: 'Expiring',
    blurb: 'Membership runs out inside the window below — worth a call.',
  },
  {
    id: 'EXPIRED',
    label: 'Expired',
    blurb: 'Their membership has run out and no renewal is queued.',
  },
  {
    id: 'NONE',
    label: 'Leads',
    blurb:
      'Never bought a plan. Mostly people who signed up in the mobile app and were auto-linked to the gym — they may never have paid or visited.',
  },
];

/**
 * Not offered in the filter row by default — it is where the Insights
 * membership chart drills into, and it only appears once selected.
 * `ACTIVE_NOT_EXPIRING` is the slice of ACTIVE that excludes anyone already
 * inside the expiring window, so the count matches the chart segment exactly.
 */
const DRILLDOWN_FILTER = {
  id: 'ACTIVE_NOT_EXPIRING' as const,
  label: 'Active, not expiring',
  blurb: 'Paid up with time left, excluding anyone already inside the expiring window.',
};

/** Windows offered for the Expiring view. The API caps `expiringInDays` at 90. */
const EXPIRING_WINDOWS = [7, 15, 30, 60, 90];

const EMPTY_TITLES: Record<View, string> = {
  ACTIVE: 'Nobody has an active membership',
  ACTIVE_NOT_EXPIRING: 'Nobody is active outside the expiring window',
  EXPIRING: 'Nothing expiring in this window',
  EXPIRED: 'No expired memberships',
  NONE: 'No leads',
  ALL: 'No members yet',
};

const EMPTY_DESCRIPTIONS: Record<View, string> = {
  ACTIVE: 'Sell a plan from a member’s page and they’ll appear here.',
  ACTIVE_NOT_EXPIRING: 'Everyone with a live membership is expiring soon.',
  EXPIRING: 'Try a longer window, or pick Active instead.',
  EXPIRED: 'Good news — nobody has lapsed.',
  NONE: 'Everyone linked to this gym has bought a plan.',
  ALL: 'Register the first walk-in to get started.',
};

/** Sorting is one button cycling a named order, not a row of arrows per column. */
const SORTS: { label: string; sortBy: MemberSortBy; sortOrder: SortOrder }[] = [
  { label: 'Joined, newest', sortBy: 'joinedAt', sortOrder: 'desc' },
  { label: 'Joined, oldest', sortBy: 'joinedAt', sortOrder: 'asc' },
  { label: 'Name, A–Z', sortBy: 'fullName', sortOrder: 'asc' },
  { label: 'Last visit, recent', sortBy: 'lastVisitAt', sortOrder: 'desc' },
];

export function MembersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const searchInput = useRef<HTMLInputElement>(null);

  const view = (params.get('membership') as View | null) ?? 'ALL';
  const expiringInDays = Number(params.get('days') ?? '7') || 7;
  const status = (params.get('status') as GymUserStatus | null) ?? undefined;
  const sortBy = (params.get('sortBy') as MemberSortBy | null) ?? 'joinedAt';
  const sortOrder = (params.get('sortOrder') as SortOrder | null) ?? 'desc';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [search, setSearch] = useState(params.get('search') ?? '');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  // Reset to page 1 whenever the search text changes the result set.
  useEffect(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        if (next.get('search') !== current.get('search')) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, setParams]);

  // "/" jumps to the search box — staff work fast and won't reach for the mouse.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.matches('input, textarea, select');
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function update(changes: Record<string, string | undefined>, resetPage = true) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) next.delete(key);
        else next.set(key, value);
      }
      if (resetPage) next.delete('page');
      return next;
    });
  }

  const query: MemberListParams = {
    page,
    limit: PAGE_SIZE,
    sortBy,
    sortOrder,
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(status ? { status } : {}),
    ...(view === 'ALL' ? {} : { membershipStatus: view }),
    ...(view === 'EXPIRING' || view === 'ACTIVE_NOT_EXPIRING' ? { expiringInDays } : {}),
  };

  const list = useMemberList(query);
  const slow = useSlowRequest(list.isLoading);
  // Feeds the counts on the filter row: one request, and a true partition.
  const stats = useMemberStats(expiringInDays);

  const data = list.data;
  const availableFilters =
    view === DRILLDOWN_FILTER.id ? [DRILLDOWN_FILTER, ...FILTERS] : FILTERS;
  const activeView = availableFilters.find((entry) => entry.id === view) ?? ALL_VIEW;
  const filtered = Boolean(debouncedSearch || status);
  const anyFilter = filtered || view !== 'ALL';
  const sortIndex = Math.max(
    0,
    SORTS.findIndex((sort) => sort.sortBy === sortBy && sort.sortOrder === sortOrder),
  );
  const currentSort = SORTS[sortIndex];

  function cycleSort() {
    const next = SORTS[(sortIndex + 1) % SORTS.length];
    update({ sortBy: next.sortBy, sortOrder: next.sortOrder });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Members</h1>
          <p className="mt-1 text-[13px] text-slate-600">{headline(stats.data)}</p>
        </div>

        <div className="relative w-80">
          <i
            className="ph ph-magnifying-glass absolute top-1/2 left-3 -translate-y-1/2 text-base text-slate-500"
            aria-hidden="true"
          />
          <input
            ref={searchInput}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, phone or member code"
            aria-label="Search members"
            className="block w-full rounded-md bg-white py-2 pr-10 pl-8.5 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-500"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded-sm px-1.5 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-300 ring-inset">
            /
          </kbd>
        </div>
      </div>

      <div className="mt-4.5 flex flex-wrap items-center justify-between gap-4">
        <div className="seg" role="group" aria-label="Filter by membership">
          {availableFilters.map((entry) => {
            const on = entry.id === view;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={on}
                // Pressing the active filter again clears it, which is how you
                // get back to everyone without a button that says so.
                onClick={() => update({ membership: on ? undefined : entry.id })}
                className="seg-opt"
              >
                {entry.label}
                <span className="tnum" style={{ color: countColour(entry.id) }}>
                  {viewCount(entry.id, stats.data)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(view === 'EXPIRING' || view === 'ACTIVE_NOT_EXPIRING') && (
            <select
              value={expiringInDays}
              onChange={(event) => update({ days: event.target.value })}
              aria-label="Expiring window"
              className="rounded-md bg-white px-2 py-1.5 text-[13px] text-slate-700 ring-1 ring-slate-300 ring-inset"
            >
              {EXPIRING_WINDOWS.map((days) => (
                <option key={days} value={days}>
                  Within {days} days
                </option>
              ))}
            </select>
          )}

          <select
            value={status ?? ''}
            onChange={(event) => update({ status: event.target.value || undefined })}
            aria-label="Filter by status"
            className="rounded-md bg-white px-2 py-1.5 text-[13px] text-slate-700 ring-1 ring-slate-300 ring-inset"
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as GymUserStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>

          <span className="text-xs text-slate-500">Sorted by</span>
          <Button variant="secondary" size="sm" onClick={cycleSort}>
            {currentSort.label}
            <i
              className={`ph ph-arrow-${currentSort.sortOrder === 'asc' ? 'up' : 'down'} text-[13px]`}
              aria-hidden="true"
            />
          </Button>

          {anyFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                update({ search: undefined, status: undefined, membership: undefined });
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {activeView.blurb}
        {list.isFetching && !list.isLoading && (
          <span className="ml-2 text-slate-400" role="status">
            Updating…
          </span>
        )}
      </p>

      <div className="mt-3 overflow-hidden rounded-md bg-white shadow-[var(--shadow-sm)]">
        {list.isLoading ? (
          <LoadingBlock label="Loading members…" slow={slow} />
        ) : list.isError ? (
          <ErrorState
            error={list.error}
            onRetry={() => list.refetch()}
            retrying={list.isFetching}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title={filtered ? 'No members match those filters' : EMPTY_TITLES[view]}
            description={
              filtered
                ? 'Try a different search term, or clear the filters.'
                : EMPTY_DESCRIPTIONS[view]
            }
            action={
              filtered ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {view !== 'ALL' && debouncedSearch && (
                    <Button onClick={() => update({ membership: undefined })}>
                      Search everyone
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch('');
                      update({ search: undefined, status: undefined });
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                view !== 'NONE' && (
                  <Button onClick={() => navigate('/members/new')}>Register member</Button>
                )
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-200">
                    <th scope="col" className="sq-th">
                      Member
                    </th>
                    <th scope="col" className="sq-th">
                      Phone
                    </th>
                    <th scope="col" className="sq-th w-58">
                      Membership
                    </th>
                    <th scope="col" className="sq-th">
                      Money
                    </th>
                    <th scope="col" className="sq-th">
                      App
                    </th>
                    <th scope="col" className="sq-th">
                      Last visit
                    </th>
                    <th scope="col" className="sq-th" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((member) => (
                    <MemberRow key={member.id} member={member} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-3.5 py-3">
              <p className="text-xs text-slate-500">
                Showing {(data.page - 1) * data.limit + 1}–
                {Math.min(data.page * data.limit, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <IconButton
                  icon="caret-left"
                  label="Previous page"
                  disabled={data.page <= 1}
                  onClick={() => update({ page: String(data.page - 1) }, false)}
                />
                <span className="tnum text-xs text-slate-500">
                  Page {data.page} of {data.totalPages || 1}
                </span>
                <IconButton
                  icon="caret-right"
                  label="Next page"
                  disabled={data.page >= data.totalPages}
                  onClick={() => update({ page: String(data.page + 1) }, false)}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** "5 with a live membership · 27 people linked to this gym" */
function headline(stats: MemberStats | undefined): string {
  if (!stats) return ' ';
  const people = `${stats.totalMembers} ${stats.totalMembers === 1 ? 'person' : 'people'} linked to this gym`;
  return `${stats.activeTotal} with a live membership · ${people}`;
}

function viewCount(view: MembershipFilter, stats: MemberStats | undefined): string {
  if (!stats) return '';
  switch (view) {
    case 'ACTIVE':
      return String(stats.activeTotal);
    case 'ACTIVE_NOT_EXPIRING':
      return String(stats.buckets.active);
    case 'EXPIRING':
      return String(stats.buckets.expiringSoon);
    case 'EXPIRED':
      return String(stats.buckets.expired);
    case 'NONE':
      return String(stats.buckets.never);
  }
}

/** The count borrows the state's colour; the label stays neutral. */
function countColour(view: MembershipFilter): string {
  switch (view) {
    case 'ACTIVE':
    case 'ACTIVE_NOT_EXPIRING':
      return 'var(--ok-txt)';
    case 'EXPIRING':
      return 'var(--warn-txt)';
    case 'EXPIRED':
      return 'var(--bad-txt)';
    default:
      return 'var(--color-neutral-500)';
  }
}

function MemberRow({ member }: { member: Member }) {
  return (
    <tr className="hover:bg-slate-100 focus-within:bg-slate-100">
      <td className="sq-cell">
        <p>
          <Link
            to={`/members/${member.id}`}
            className="text-[13px] text-indigo-700 hover:underline"
          >
            {memberName(member)}
          </Link>
          {member.medicalNotes && (
            <i
              className="ph-fill ph-first-aid-kit ml-1.5 align-[-1px] text-[13px] text-red-500"
              title="Has medical notes"
              role="img"
              aria-label="Has medical notes"
            />
          )}
        </p>
        <p className="tnum mt-0.5 text-[11px] text-slate-500">
          {member.memberCode ?? 'No code'} · joined {formatDate(member.joinedAt)}
        </p>
      </td>
      <td className="sq-cell tnum">{formatPhone(member.phone)}</td>
      <td className="sq-cell">
        <MembershipCell member={member} />
      </td>
      <td className="sq-cell">
        {member.membership && member.membership.balance > 0 ? (
          <span className="pill pill-warn tnum">
            {formatMoney(member.membership.balance)} owing
          </span>
        ) : (
          <span className="text-slate-500">Settled</span>
        )}
      </td>
      <td className="sq-cell">
        {member.hasAppAccount ? (
          <i
            className="ph-fill ph-device-mobile text-[15px] text-indigo-400"
            title="App installed"
            role="img"
            aria-label="App installed"
          />
        ) : (
          <i
            className="ph ph-device-mobile-slash text-[15px] text-slate-300"
            title="No app yet"
            role="img"
            aria-label="No app yet"
          />
        )}
      </td>
      <td className="sq-cell tnum whitespace-nowrap">{formatDate(member.lastVisitAt)}</td>
      <td className="sq-cell text-right">
        <Link
          to={`/members/${member.id}`}
          aria-label={`Open ${memberName(member)}`}
          className="text-slate-500 hover:text-slate-700"
        >
          <i className="ph ph-caret-right" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

/**
 * What the member has bought, as one line plus a countdown bar. The bar fills
 * as the term runs down, so a nearly-full bar in warning colour is what the
 * eye catches when scanning the column — no second badge needed.
 */
function MembershipCell({ member }: { member: Member }) {
  const summary = summariseMembership(member.membership);
  const progress = membershipProgress(member.membership);

  if (!progress) {
    return (
      <div className="min-w-40">
        <span className="text-xs text-slate-500">{summary.label}</span>
        {summary.detail && <p className="mt-1 text-[11px] text-slate-500">{summary.detail}</p>}
      </div>
    );
  }

  // `summariseMembership` writes "3 Months · 5 days left"; the plan name stays
  // neutral and only the countdown half takes the state colour.
  const [plan, ...rest] = summary.label.split(' · ');

  return (
    <div className="min-w-40">
      <p className="text-xs text-slate-700">
        {plan}
        {rest.length > 0 && (
          <>
            {' · '}
            <span style={{ color: `var(--${progress.tone}-txt)` }}>{rest.join(' · ')}</span>
          </>
        )}
      </p>
      <div className="mt-1.5 h-[3px] rounded-full bg-slate-300">
        <div
          className="h-[3px] rounded-full"
          style={{ width: `${progress.percent}%`, background: `var(--${progress.tone})` }}
        />
      </div>
      {summary.detail && <p className="mt-1 text-[11px] text-slate-500">{summary.detail}</p>}
    </div>
  );
}
