import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, LoadingBlock } from '../components/states';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatDate, formatPhone } from '../lib/format';
import { useMemberList } from '../members/queries';
import { STATUS_LABELS } from '../api/types';
import type {
  GymUserStatus,
  Member,
  MemberSortBy,
  MembershipFilter,
  MemberListParams,
  SortOrder,
} from '../api/types';
import { summariseMembership } from '../members/membership';
import { formatMoney } from '../lib/format';

const PAGE_SIZE = 20;

/**
 * The list mixes two populations: people who have actually bought a plan, and
 * anyone who merely logged into the mobile app and was auto-linked to the gym.
 * Splitting on `membershipStatus` rather than `source` is the cleaner divide —
 * it separates paying members from people who have never bought anything,
 * however they arrived.
 */
type Tab = 'ALL' | MembershipFilter;

const TABS: { id: Tab; label: string; blurb: string }[] = [
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
  { id: 'ALL', label: 'Everyone', blurb: 'Every person linked to this gym.' },
];

/** Windows offered for the Expiring tab. The API caps `expiringInDays` at 90. */
const EXPIRING_WINDOWS = [7, 15, 30, 60, 90];

/** Reads naturally after a number: "2 active members", "22 leads", "1 person". */
const COUNT_NOUN: Record<Tab, [singular: string, plural: string]> = {
  ACTIVE: ['active member', 'active members'],
  EXPIRING: ['expiring member', 'expiring members'],
  EXPIRED: ['expired member', 'expired members'],
  NONE: ['lead', 'leads'],
  ALL: ['person', 'people'],
};

const EMPTY_TITLES: Record<Tab, string> = {
  ACTIVE: 'Nobody has an active membership',
  EXPIRING: 'Nothing expiring in this window',
  EXPIRED: 'No expired memberships',
  NONE: 'No leads',
  ALL: 'No members yet',
};

const EMPTY_DESCRIPTIONS: Record<Tab, string> = {
  ACTIVE: 'Sell a plan from a member\u2019s page and they\u2019ll appear here.',
  EXPIRING: 'Try a longer window, or check the Active tab.',
  EXPIRED: 'Good news \u2014 nobody has lapsed.',
  NONE: 'Everyone linked to this gym has bought a plan.',
  ALL: 'Register the first walk-in to get started.',
};

const SORTABLE: { field: MemberSortBy; label: string; className?: string }[] = [
  { field: 'fullName', label: 'Name' },
  { field: 'joinedAt', label: 'Joined' },
  { field: 'lastVisitAt', label: 'Last visit' },
];

export function MembersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const searchInput = useRef<HTMLInputElement>(null);

  const tab = (params.get('tab') as Tab | null) ?? 'ACTIVE';
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
    ...(tab === 'ALL' ? {} : { membershipStatus: tab }),
    ...(tab === 'EXPIRING' ? { expiringInDays } : {}),
  };

  const list = useMemberList(query);
  const slow = useSlowRequest(list.isLoading);

  const data = list.data;
  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const filtered = Boolean(debouncedSearch || status);

  function toggleSort(field: MemberSortBy) {
    // Re-sorting returns to page 1 — staff expect to see the new top of the list.
    if (field === sortBy) {
      update({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      // Names read best A→Z; dates read best newest-first.
      update({ sortBy: field, sortOrder: field === 'fullName' ? 'asc' : 'desc' });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Members</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {data ? `${data.total} ${COUNT_NOUN[tab][data.total === 1 ? 0 : 1]}` : ' '}
            {tab === 'EXPIRING' && data ? ` within ${expiringInDays} days` : ''}
          </p>
        </div>
        <Button onClick={() => navigate('/members/new')}>Register member</Button>
      </div>

      <div className="mt-4 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex gap-1 border-b border-slate-200 px-2 pt-2" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={entry.id === tab}
              onClick={() => update({ tab: entry.id })}
              className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium ${
                entry.id === tab
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="relative min-w-64 flex-1">
            <input
              ref={searchInput}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone or member code"
              aria-label="Search members"
              className="block w-full rounded-md bg-white px-3 py-2 pr-16 text-sm ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400">
              /
            </kbd>
          </div>

          <select
            value={status ?? ''}
            onChange={(event) => update({ status: event.target.value || undefined })}
            aria-label="Filter by status"
            className="rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
          >
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABELS) as GymUserStatus[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>

          {tab === 'EXPIRING' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Within
              <select
                value={expiringInDays}
                onChange={(event) => update({ days: event.target.value })}
                className="rounded-md bg-white px-2 py-2 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
              >
                {EXPIRING_WINDOWS.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </select>
            </label>
          )}

          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                update({ search: undefined, status: undefined });
              }}
            >
              Clear filters
            </Button>
          )}

          {list.isFetching && !list.isLoading && (
            <span className="text-xs text-slate-400" role="status">
              Updating…
            </span>
          )}
        </div>

        <p className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
          {activeTab.blurb}
        </p>

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
            title={filtered ? 'No members match those filters' : EMPTY_TITLES[tab]}
            description={
              filtered
                ? 'Try a different search term, or clear the filters.'
                : EMPTY_DESCRIPTIONS[tab]
            }
            action={
              filtered ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {tab !== 'ALL' && debouncedSearch && (
                    <Button onClick={() => update({ tab: 'ALL' })}>Search everyone</Button>
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
                tab !== 'NONE' && (
                  <Button onClick={() => navigate('/members/new')}>Register member</Button>
                )
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Code
                    </th>
                    {SORTABLE.slice(0, 1).map((column) => (
                      <SortHeader
                        key={column.field}
                        column={column}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={toggleSort}
                      />
                    ))}
                    <th scope="col" className="px-4 py-2 font-medium">
                      Phone
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Membership
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      App
                    </th>
                    {SORTABLE.slice(1).map((column) => (
                      <SortHeader
                        key={column.field}
                        column={column}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSort={toggleSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50 focus-within:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {member.memberCode ?? <span className="text-slate-400">No code</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/members/${member.id}`}
                          className="font-medium text-indigo-700 hover:underline"
                        >
                          {member.fullName ?? (
                            <span className="italic text-slate-500">Unnamed member</span>
                          )}
                        </Link>
                        {member.medicalNotes && (
                          <span
                            className="ml-2 align-middle text-xs text-amber-600"
                            title="Has medical notes"
                          >
                            ⚕
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{formatPhone(member.phone)}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={member.status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <MembershipCell member={member} />
                      </td>
                      <td className="px-4 py-2.5">
                        {member.hasAppAccount ? (
                          <Badge tone="indigo">Installed</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">Not yet</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                        {formatDate(member.joinedAt)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">
                        {formatDate(member.lastVisitAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
              <p className="text-slate-500">
                Showing {(data.page - 1) * data.limit + 1}–
                {Math.min(data.page * data.limit, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => update({ page: String(data.page - 1) }, false)}
                >
                  Previous
                </Button>
                <span className="text-slate-500">
                  Page {data.page} of {data.totalPages || 1}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={data.page >= data.totalPages}
                  onClick={() => update({ page: String(data.page + 1) }, false)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  column: { field: MemberSortBy; label: string };
  sortBy: MemberSortBy;
  sortOrder: SortOrder;
  onSort: (field: MemberSortBy) => void;
}) {
  const active = column.field === sortBy;
  return (
    <th
      scope="col"
      className="px-4 py-2 font-medium"
      aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column.field)}
        className={`inline-flex items-center gap-1 uppercase hover:text-slate-700 ${
          active ? 'text-slate-800' : ''
        }`}
      >
        {column.label}
        <span aria-hidden="true" className={active ? '' : 'text-slate-300'}>
          {active ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

/**
 * What the member has bought, at a glance. A balance owing is called out
 * separately — it is the thing the desk needs to act on.
 */
function MembershipCell({ member }: { member: Member }) {
  const summary = summariseMembership(member.membership);
  return (
    <div className="min-w-40">
      <Badge tone={summary.tone}>{summary.label}</Badge>
      {member.membership && member.membership.balance > 0 && (
        <span className="mt-1 block text-xs font-medium text-amber-700">
          {formatMoney(member.membership.balance)} owing
        </span>
      )}
      {member.membership && summary.detail && !member.membership.balance && (
        <span className="mt-1 block text-xs text-slate-400">{summary.detail}</span>
      )}
    </div>
  );
}
