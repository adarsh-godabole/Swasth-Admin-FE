import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { gyms } from '../api/endpoints';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorState, LoadingBlock } from '../components/states';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatDate, formatPhone, formatTime, memberName } from '../lib/format';
import { useMemberList } from '../members/queries';
import {
  dateInTimeZone,
  shiftDate,
  useDayRegister,
  useRecordCheckIn,
} from '../members/checkInQueries';
import { summariseMembership } from '../members/membership';
import { CHECK_IN_SOURCE_LABELS } from '../api/types';
import type { CheckIn, Member } from '../api/types';

/**
 * The front desk's busiest screen: who came in today, and a fast way to record
 * the person standing at the counter. There is no check-out, so this is an
 * arrivals register rather than live occupancy.
 */
export function CheckInsPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const searchInput = useRef<HTMLInputElement>(null);

  const gym = useQuery({
    queryKey: ['gym', 'current'],
    queryFn: gyms.current,
    staleTime: 10 * 60 * 1000,
  });
  const timezone = gym.data?.timezone;
  const today = dateInTimeZone(timezone);
  const date = params.get('date') ?? today;
  const isToday = date === today;

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  /** A 403 explains why someone can't check in; it needs an action, not a toast. */
  const [blocked, setBlocked] = useState<{ memberId: string; message: string } | null>(null);

  const register = useDayRegister(date);
  const slow = useSlowRequest(register.isLoading);
  const record = useRecordCheckIn();

  const results = useMemberList(
    debouncedSearch ? { search: debouncedSearch, limit: 8, sortBy: 'fullName', sortOrder: 'asc' } : {},
  );

  // "/" jumps to the check-in box — this screen is used one-handed at a counter.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key === '/' && !target?.matches('input, textarea, select')) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const items = register.data?.items ?? [];
  const checkedInIds = new Map(items.map((item) => [item.memberId, item]));

  function checkIn(member: Member) {
    setBlocked(null);
    record.mutate(member.id, {
      onSuccess: (result) => {
        setSearch('');
        if (result.alreadyCheckedIn) {
          toast.info(
            `${memberName(member)} was already checked in at ${formatTime(result.checkedInAt, timezone)}.`,
          );
        } else {
          toast.success(`${memberName(member)} checked in.`);
        }
      },
      onError: (error) => {
        if (error instanceof ApiError && error.statusCode === 403) {
          setBlocked({ memberId: member.id, message: error.message });
          return;
        }
        if (error instanceof ApiError) toast.error(error.message, error.errors);
        else toast.error('Could not record the check-in.');
      },
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Check-ins</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Who came in{' '}
            {isToday ? 'today' : `on ${formatDate(date)}`}
            {register.data ? ` · ${register.data.total} ${register.data.total === 1 ? 'visit' : 'visits'}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous day"
            onClick={() => setParams({ date: shiftDate(date, -1) })}
          >
            ←
          </Button>
          <input
            type="date"
            value={date}
            max={today}
            aria-label="Register date"
            onChange={(event) => event.target.value && setParams({ date: event.target.value })}
            className="rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
          />
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next day"
            disabled={isToday}
            onClick={() => setParams({ date: shiftDate(date, 1) })}
          >
            →
          </Button>
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setParams({})}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Recording always stamps "now", so it only makes sense on today's page. */}
      {isToday ? (
        <section className="mt-4 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-4 py-3">
            <label
              htmlFor="checkin-search"
              className="block text-sm font-semibold text-slate-800"
            >
              Check someone in
            </label>
            <div className="relative mt-2">
              <input
                id="checkin-search"
                ref={searchInput}
                type="search"
                autoFocus
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setBlocked(null);
                }}
                placeholder="Search name, phone or member code"
                className="block w-full rounded-md bg-white px-3 py-2 pr-16 text-sm ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600"
              />
              <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400">
                /
              </kbd>
            </div>
          </div>

          {debouncedSearch && (
            <SearchResults
              query={results}
              blocked={blocked}
              pending={record.isPending}
              pendingId={record.variables}
              checkedIn={checkedInIds}
              timezone={timezone}
              onCheckIn={checkIn}
            />
          )}
        </section>
      ) : (
        <p className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          You're looking at a past day. Check-ins are always stamped with the current time, so
          switch back to <button
            type="button"
            className="font-medium text-indigo-700 underline"
            onClick={() => setParams({})}
          >
            today
          </button> to record one.
        </p>
      )}

      <section className="mt-4 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {isToday ? "Today's register" : `Register · ${formatDate(date)}`}
          </h2>
          {register.isFetching && !register.isLoading && (
            <span className="text-xs text-slate-400" role="status">
              Updating…
            </span>
          )}
        </header>

        {register.isLoading ? (
          <LoadingBlock label="Loading the register…" slow={slow} />
        ) : register.isError ? (
          <ErrorState
            error={register.error}
            onRetry={() => register.refetch()}
            retrying={register.isFetching}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={isToday ? 'Nobody has come in yet today' : 'Nobody came in that day'}
            description={
              isToday
                ? 'Members can tap to check in from the app, or you can record a visit above.'
                : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <RegisterRow key={item.id} checkIn={item} timezone={timezone} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SearchResults({
  query,
  blocked,
  pending,
  pendingId,
  checkedIn,
  timezone,
  onCheckIn,
}: {
  query: ReturnType<typeof useMemberList>;
  blocked: { memberId: string; message: string } | null;
  pending: boolean;
  pendingId: string | undefined;
  checkedIn: Map<string, CheckIn>;
  timezone: string | undefined;
  onCheckIn: (member: Member) => void;
}) {
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500" role="status">
        <Spinner className="size-4 text-indigo-600" />
        Searching…
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const members = query.data?.items ?? [];
  if (members.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-slate-500">
        Nobody matches that. Try their phone number or member code.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {members.map((member) => {
        const already = checkedIn.get(member.id);
        const summary = summariseMembership(member.membership);
        const isBlocked = blocked?.memberId === member.id;

        return (
          <li key={member.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/members/${member.id}`}
                    className="font-medium text-indigo-700 hover:underline"
                  >
                    {memberName(member)}
                  </Link>
                  {member.memberCode && (
                    <span className="font-mono text-xs text-slate-500">{member.memberCode}</span>
                  )}
                  <Badge tone={summary.tone}>{summary.label}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{formatPhone(member.phone)}</p>
              </div>

              {already ? (
                <span className="text-sm font-medium text-emerald-700">
                  ✓ Checked in at {formatTime(already.checkedInAt, timezone)}
                </span>
              ) : (
                <Button
                  size="sm"
                  loading={pending && pendingId === member.id}
                  disabled={pending}
                  onClick={() => onCheckIn(member)}
                >
                  Check in
                </Button>
              )}
            </div>

            {isBlocked && (
              <div
                role="alert"
                className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset"
              >
                <p className="font-medium">{blocked.message}</p>
                <p className="mt-0.5 text-xs">
                  {/* The backend message is written for the member, so spell out
                      the desk-side detail it leaves implicit. */}
                  {member.membership?.status === 'UPCOMING'
                    ? `Their ${member.membership.planName} doesn't start until ${formatDate(member.membership.startDate)}, so they can't check in yet. `
                    : 'Check-in needs an active membership. '}
                  <Link to={`/members/${member.id}`} className="font-medium underline">
                    Open {memberName(member)}
                  </Link>{' '}
                  to sell or renew a plan.
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RegisterRow({ checkIn, timezone }: { checkIn: CheckIn; timezone: string | undefined }) {
  const member = checkIn.member;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-20 shrink-0 text-sm font-medium text-slate-800 tabular-nums">
          {formatTime(checkIn.checkedInAt, timezone)}
        </span>
        <div className="min-w-0">
          <Link
            to={`/members/${checkIn.memberId}`}
            className="font-medium text-indigo-700 hover:underline"
          >
            {member ? memberName(member) : 'View member'}
          </Link>
          {member?.memberCode && (
            <span className="ml-2 font-mono text-xs text-slate-500">{member.memberCode}</span>
          )}
        </div>
      </div>
      <Badge tone={checkIn.source === 'APP' ? 'indigo' : 'slate'}>
        {CHECK_IN_SOURCE_LABELS[checkIn.source]}
      </Badge>
    </li>
  );
}
