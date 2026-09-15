import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { gyms } from '../api/endpoints';
import { Badge, Tag } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorState, LoadingBlock } from '../components/states';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatDate, formatMoney, formatPhone, formatTime, initials, memberName } from '../lib/format';
import { useMemberList } from '../members/queries';
import {
  dateInTimeZone,
  shiftDate,
  useDayRegister,
  useRecordCheckIn,
} from '../members/checkInQueries';
import { useExpiringSubscriptions } from '../members/planQueries';
import { useMemberStats } from '../members/insightQueries';
import { summariseMembership } from '../members/membership';
import { CHECK_IN_SOURCE_LABELS } from '../api/types';
import type { CheckIn, Member } from '../api/types';

/**
 * The landing screen. The counter action comes first — a member is standing
 * there — and the day's register sits below it beside a summary of what the
 * desk should chase. There is no check-out, so this is an arrivals register
 * rather than live occupancy.
 */
export function DeskPage() {
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

  const items = useMemo(() => register.data?.items ?? [], [register.data]);
  const checkedInIds = new Map(items.map((item) => [item.memberId, item]));
  const fromApp = items.filter((item) => item.source === 'APP').length;

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
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">{longDate(date)}</h1>
          <p className="mt-1 text-[13px] text-slate-600">
            {register.data
              ? `${register.data.total} ${register.data.total === 1 ? 'arrival' : 'arrivals'}${isToday ? ' so far' : ''} · ${fromApp} from the app, ${items.length - fromApp} recorded here`
              : ' '}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton
            icon="caret-left"
            label="Previous day"
            onClick={() => setParams({ date: shiftDate(date, -1) })}
          />
          <input
            type="date"
            value={date}
            max={today}
            aria-label="Register date"
            onChange={(event) => event.target.value && setParams({ date: event.target.value })}
            className="tnum rounded-md bg-white px-2 py-1.5 text-[13px] text-slate-700 ring-1 ring-slate-300 ring-inset"
          />
          <IconButton
            icon="caret-right"
            label="Next day"
            disabled={isToday}
            onClick={() => setParams({ date: shiftDate(date, 1) })}
          />
          {!isToday && (
            <Button variant="ghost" size="sm" onClick={() => setParams({})}>
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Recording always stamps "now", so it only makes sense on today's page. */}
      {isToday ? (
        <section className="sq-panel mt-5 px-5 py-4.5">
          <label className="sq-lbl block" htmlFor="checkin-search">
            Check someone in
          </label>
          <div className="relative mt-2.5">
            <i
              className="ph ph-magnifying-glass absolute top-1/2 left-3 -translate-y-1/2 text-[17px] text-slate-500"
              aria-hidden="true"
            />
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
              className="block h-11 w-full rounded-md bg-slate-50 pr-16 pl-9.5 text-[15px] text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-500"
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-sm px-1.5 py-0.5 text-[11px] text-slate-500 ring-1 ring-slate-300 ring-inset">
              /
            </kbd>
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
        <p className="sq-note sq-note-accent mt-5 text-[13px] text-slate-600">
          You're looking at a past day. Check-ins are always stamped with the current time, so
          switch back to{' '}
          <button type="button" className="text-indigo-700 underline" onClick={() => setParams({})}>
            today
          </button>{' '}
          to record one.
        </p>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-md bg-white shadow-[var(--shadow-sm)]">
          <header className="flex items-center justify-between border-b border-slate-200 px-4.5 py-3.5">
            <h2 className="sq-lbl">
              {isToday ? "Today's register" : `Register · ${formatDate(date)}`}
            </h2>
            {register.isFetching && !register.isLoading ? (
              <span className="text-xs text-slate-400" role="status">
                Updating…
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                {items.length} {items.length === 1 ? 'arrival' : 'arrivals'}
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
            <ul>
              {items.map((item, index) => (
                <RegisterRow
                  key={item.id}
                  checkIn={item}
                  timezone={timezone}
                  first={index === 0}
                />
              ))}
            </ul>
          )}
        </section>

        <DaySummary items={items} timezone={timezone} />
      </div>
    </div>
  );
}

/** "Thursday, 10 September" — the desk thinks in days, not ISO strings. */
function longDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
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
      <div className="flex items-center gap-2 px-1 py-5 text-[13px] text-slate-500" role="status">
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
      <p className="px-1 py-5 text-center text-[13px] text-slate-500">
        Nobody matches that. Try their phone number or member code.
      </p>
    );
  }

  return (
    <ul className="mt-3.5 flex flex-col gap-2">
      {members.map((member) => {
        const already = checkedIn.get(member.id);
        const summary = summariseMembership(member.membership);
        const isBlocked = blocked?.memberId === member.id;

        return (
          <li
            key={member.id}
            className="rounded-md bg-slate-50 px-3.5 py-3 ring-1 ring-slate-300 ring-inset"
          >
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs text-slate-700">
                {initials(member.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link to={`/members/${member.id}`} className="text-indigo-700 hover:underline">
                    {memberName(member)}
                  </Link>
                  {member.memberCode && (
                    <span className="tnum ml-2 text-xs text-slate-500">{member.memberCode}</span>
                  )}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <Badge tone={summary.tone}>{summary.label}</Badge>
                  <span className="tnum">{formatPhone(member.phone)}</span>
                </p>
              </div>

              {already ? (
                <span className="flex items-center gap-1.5 text-[13px] text-emerald-700">
                  <i className="ph-fill ph-check-circle text-base" aria-hidden="true" />
                  In at {formatTime(already.checkedInAt, timezone)}
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
              <div role="alert" className="sq-note sq-note-bad mt-2.5">
                <p className="text-[13px] text-slate-800">{blocked.message}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {/* The backend message is written for the member, so spell out
                      the desk-side detail it leaves implicit. */}
                  {member.membership?.status === 'UPCOMING'
                    ? `Their ${member.membership.planName} doesn't start until ${formatDate(member.membership.startDate)}, so they can't check in yet. `
                    : 'Check-in needs an active membership. '}
                  <Link to={`/members/${member.id}`} className="text-indigo-700 underline">
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

function RegisterRow({
  checkIn,
  timezone,
  first,
}: {
  checkIn: CheckIn;
  timezone: string | undefined;
  first: boolean;
}) {
  const member = checkIn.member;

  return (
    <li
      className={`flex items-center gap-3.5 px-4.5 py-2.5 ${first ? '' : 'border-t border-slate-200'}`}
    >
      <span className="tnum w-16 shrink-0 text-[13px] text-slate-600">
        {formatTime(checkIn.checkedInAt, timezone)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <Link to={`/members/${checkIn.memberId}`} className="text-indigo-700 hover:underline">
          {member ? memberName(member) : 'View member'}
        </Link>
        {member?.memberCode && (
          <span className="tnum ml-2 text-xs text-slate-500">{member.memberCode}</span>
        )}
      </span>
      <Tag tone={checkIn.source === 'FRONT_DESK' ? 'neutral' : 'accent'}>
        {CHECK_IN_SOURCE_LABELS[checkIn.source]}
      </Tag>
    </li>
  );
}

/**
 * The right-hand column: the shape of the day, then the three things worth
 * acting on. Each line is a link into the screen that handles it.
 */
function DaySummary({ items, timezone }: { items: CheckIn[]; timezone: string | undefined }) {
  const due = useExpiringSubscriptions(7);
  const stats = useMemberStats(7);

  const dueItems = due.data ?? [];
  const owed = dueItems.reduce((sum, item) => sum + item.balance, 0);
  const owing = dueItems.filter((item) => item.balance > 0).length;
  const leads = stats.data?.buckets.never ?? 0;

  const hours = useMemo(() => byHour(items, timezone), [items, timezone]);
  const busiest = hours.reduce(
    (best, count, hour) => (count > hours[best] ? hour : best),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-md bg-white p-3.5 shadow-[var(--shadow-sm)]">
        <p className="sq-lbl">Arrivals by hour</p>
        <HourChart hours={hours} />
        <p className="mt-2 text-xs text-slate-500">
          {items.length === 0
            ? 'No arrivals recorded yet.'
            : `Busiest hour: ${hourLabel(busiest)}–${hourLabel(busiest + 1)}.`}
        </p>
      </section>

      <section className="rounded-md bg-white p-3.5 shadow-[var(--shadow-sm)]">
        <p className="sq-lbl">Needs attention</p>
        <ul className="mt-2.5 flex flex-col gap-2.5 text-[13px] text-slate-700">
          <li className="flex gap-2.5">
            <i
              className="ph ph-hourglass-high shrink-0 text-base text-amber-600"
              aria-hidden="true"
            />
            <span>
              {dueItems.length === 0 ? (
                'Nothing ends in the next 7 days.'
              ) : (
                <>
                  {dueItems.length}{' '}
                  {dueItems.length === 1 ? 'membership ends' : 'memberships end'} this week —{' '}
                  <Link to="/renewals" className="text-indigo-700 hover:underline">
                    call list
                  </Link>
                </>
              )}
            </span>
          </li>
          {owed > 0 && (
            <li className="flex gap-2.5">
              <i
                className="ph ph-currency-inr shrink-0 text-base text-amber-600"
                aria-hidden="true"
              />
              <span>
                <span className="tnum text-amber-700">{formatMoney(owed)}</span> owing on{' '}
                {owing === 1 ? 'one live plan' : `${owing} live plans`}
              </span>
            </li>
          )}
          {leads > 0 && (
            <li className="flex gap-2.5">
              <i
                className="ph ph-device-mobile shrink-0 text-base text-indigo-400"
                aria-hidden="true"
              />
              <span>
                <Link to="/members?membership=NONE" className="text-indigo-700 hover:underline">
                  {leads} {leads === 1 ? 'lead has' : 'leads have'} never bought
                </Link>
              </span>
            </li>
          )}
        </ul>
      </section>

      <Link
        to="/desk/qr"
        className="flex items-center gap-3 rounded-md bg-white p-3.5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
      >
        <i className="ph ph-qr-code shrink-0 text-xl text-indigo-400" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-slate-900">Door QR</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Members scan on the way in and check themselves in
          </span>
        </span>
        <i className="ph ph-caret-right shrink-0 text-slate-500" aria-hidden="true" />
      </Link>

      <p className="text-[11px] leading-relaxed text-slate-500">
        Arrivals only — the app has no check-out, so this is a register, not occupancy.
      </p>
    </div>
  );
}

/** Counts per hour of the gym's day, 6am to 10pm — the hours a gym is open. */
const FIRST_HOUR = 6;
const LAST_HOUR = 22;

function byHour(items: CheckIn[], timezone: string | undefined): number[] {
  const counts = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, () => 0);
  for (const item of items) {
    const hour = hourInZone(item.checkedInAt, timezone);
    if (hour === null) continue;
    const slot = Math.min(Math.max(hour, FIRST_HOUR), LAST_HOUR) - FIRST_HOUR;
    counts[slot] += 1;
  }
  return counts;
}

function hourInZone(iso: string, timeZone: string | undefined): number | null {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).format(new Date(iso));
    const hour = Number(formatted);
    return Number.isNaN(hour) ? null : hour;
  } catch {
    return null;
  }
}

function hourLabel(slot: number): string {
  const hour = (slot + FIRST_HOUR) % 24;
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * Drawn by hand rather than through the chart components — it is a sparkline
 * with no axes, and a full chart frame would outweigh the data.
 */
function HourChart({ hours }: { hours: number[] }) {
  const peak = Math.max(1, ...hours);
  const step = 260 / hours.length;
  const width = Math.max(6, step - 4);

  return (
    <svg
      viewBox="0 0 260 72"
      className="mt-2.5 h-18 w-full"
      role="img"
      aria-label={`Arrivals by hour, ${hourLabel(0)} to ${hourLabel(hours.length - 1)}`}
    >
      <line x1="0" x2="260" y1="64" y2="64" stroke="var(--color-neutral-800)" strokeWidth="1" />
      {hours.map((count, index) => {
        const height = count === 0 ? 0 : Math.max(3, (count / peak) * 56);
        // The busiest bars lift out of the ramp so the peak reads at a glance.
        const fill =
          count === peak
            ? 'var(--color-accent-400)'
            : count >= peak * 0.6
              ? 'var(--color-accent-500)'
              : 'var(--color-accent-700)';
        return (
          <rect
            key={index}
            x={index * step + 2}
            y={64 - height}
            width={width}
            height={height}
            rx="3"
            fill={fill}
          />
        );
      })}
      <text x="8" y="6" fontSize="8" fill="var(--color-neutral-500)" fontFamily="Inter, system-ui">
        {hourLabel(0)}
      </text>
      <text
        x="252"
        y="6"
        textAnchor="end"
        fontSize="8"
        fill="var(--color-neutral-500)"
        fontFamily="Inter, system-ui"
      >
        {hourLabel(hours.length - 1)}
      </text>
    </svg>
  );
}
