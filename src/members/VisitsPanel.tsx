import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { gyms } from '../api/endpoints';
import { Tag } from '../components/Badge';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { ErrorState } from '../components/states';
import { formatDate, formatTime, memberName } from '../lib/format';
import { dateInTimeZone, useMemberCheckIns, useRecordCheckIn } from './checkInQueries';
import { CHECK_IN_SOURCE_LABELS } from '../api/types';
import type { CheckIn, Member } from '../api/types';

const SHOWN = 8;

/**
 * Visit history, and the fastest way to record one while you already have the
 * member open. There is no check-out, so each row is an arrival.
 */
export function VisitsPanel({ member }: { member: Member }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [blocked, setBlocked] = useState<string>();

  const gym = useQuery({
    queryKey: ['gym', 'current'],
    queryFn: gyms.current,
    staleTime: 10 * 60 * 1000,
  });
  const timezone = gym.data?.timezone;
  const today = dateInTimeZone(timezone);

  const history = useMemberCheckIns(member.id);
  const record = useRecordCheckIn();

  const visits = history.data ?? [];
  const shown = expanded ? visits : visits.slice(0, SHOWN);
  const checkedInToday = visits.some((visit) => visit.date.slice(0, 10) === today);

  function checkIn() {
    setBlocked(undefined);
    record.mutate(member.id, {
      onSuccess: (result) => {
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
          setBlocked(error.message);
          return;
        }
        if (error instanceof ApiError) toast.error(error.message, error.errors);
        else toast.error('Could not record the check-in.');
      },
    });
  }

  return (
    <section className="overflow-hidden rounded-md bg-white shadow-[var(--shadow-sm)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4.5 py-3">
        <div>
          <h2 className="sq-lbl">Visits · {visits.length}</h2>
          <p className="mt-1 text-xs text-slate-500">
            {checkedInToday
              ? 'Checked in today.'
              : member.lastVisitAt
                ? `Last came in ${formatDate(member.lastVisitAt)}.`
                : 'Has never checked in.'}
          </p>
        </div>
        {checkedInToday ? (
          <span className="flex items-center gap-1.5 text-[13px] text-emerald-700">
            <i className="ph-fill ph-check-circle text-base" aria-hidden="true" />
            In today
          </span>
        ) : (
          <Button variant="secondary" size="sm" loading={record.isPending} onClick={checkIn}>
            Check in now
          </Button>
        )}
      </header>

      {blocked && (
        <p
          role="alert"
          className="border-b border-slate-200 px-4.5 py-2.5 text-[13px] text-amber-700"
        >
          {blocked} Sell or renew a plan above, then check them in.
        </p>
      )}

      {history.isLoading ? (
        <div className="flex items-center gap-2 px-4.5 py-6 text-[13px] text-slate-500" role="status">
          <Spinner className="size-4 text-indigo-600" />
          Loading visits…
        </div>
      ) : history.isError ? (
        <ErrorState
          error={history.error}
          onRetry={() => history.refetch()}
          retrying={history.isFetching}
        />
      ) : visits.length === 0 ? (
        <p className="px-4.5 py-6 text-center text-[13px] text-slate-500">No visits recorded yet.</p>
      ) : (
        <>
          <WeeklyVisits visits={visits} />
          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {shown.map((visit) => (
              <li
                key={visit.id}
                className="flex items-center justify-between gap-3 px-4.5 py-2.5 text-[13px]"
              >
                <span className="text-slate-700">{formatDate(visit.date)}</span>
                <div className="flex items-center gap-3">
                  <span className="tnum text-slate-500">
                    {formatTime(visit.checkedInAt, timezone)}
                  </span>
                  <Tag tone={visit.source === 'APP' ? 'accent' : 'neutral'}>
                    {CHECK_IN_SOURCE_LABELS[visit.source]}
                  </Tag>
                </div>
              </li>
            ))}
          </ul>
          {visits.length > SHOWN && (
            <div className="border-t border-slate-200 px-4.5 py-2.5">
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="text-xs text-indigo-700 hover:underline"
              >
                {expanded ? 'Show fewer' : `Show all ${visits.length} visits`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Twelve weeks of attendance as one strip — the shape of a habit, not a table. */
const WEEKS = 12;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function WeeklyVisits({ visits }: { visits: CheckIn[] }) {
  const now = Date.now();
  const buckets = Array.from({ length: WEEKS }, () => 0);

  for (const visit of visits) {
    const when = Date.parse(visit.date);
    if (Number.isNaN(when)) continue;
    // Bucket 0 is the oldest week in the window; the last is the current one.
    const index = WEEKS - 1 - Math.floor((now - when) / MS_PER_WEEK);
    if (index >= 0 && index < WEEKS) buckets[index] += 1;
  }

  const peak = Math.max(...buckets);
  if (peak === 0) return null;

  return (
    <div className="px-4.5 py-4">
      <div className="flex h-10 items-end gap-[3px]" aria-hidden="true">
        {buckets.map((count, index) => (
          <div
            key={index}
            className="flex-1 rounded-sm"
            style={{
              height: `${Math.max(count === 0 ? 4 : 12, (count / peak) * 100)}%`,
              background:
                count === 0
                  ? 'var(--color-neutral-900)'
                  : count === peak
                    ? 'var(--color-accent-300)'
                    : 'var(--color-accent-600)',
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Visits per week, last twelve weeks · busiest {peak}
      </p>
    </div>
  );
}
