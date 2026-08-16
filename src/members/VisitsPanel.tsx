import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { gyms } from '../api/endpoints';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { ErrorState } from '../components/states';
import { formatDate, formatTime, memberName } from '../lib/format';
import { dateInTimeZone, useMemberCheckIns, useRecordCheckIn } from './checkInQueries';
import { CHECK_IN_SOURCE_LABELS } from '../api/types';
import type { Member } from '../api/types';

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
    <section className="mt-4 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Visits</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {checkedInToday
              ? 'Checked in today.'
              : member.lastVisitAt
                ? `Last came in ${formatDate(member.lastVisitAt)}.`
                : 'Has never checked in.'}
          </p>
        </div>
        {checkedInToday ? (
          <span className="text-sm font-medium text-emerald-700">✓ Checked in today</span>
        ) : (
          <Button variant="secondary" size="sm" loading={record.isPending} onClick={checkIn}>
            Check in now
          </Button>
        )}
      </header>

      {blocked && (
        <p
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-900"
        >
          <span className="font-medium">{blocked}</span> Sell or renew a plan above, then check them
          in.
        </p>
      )}

      {history.isLoading ? (
        <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500" role="status">
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
        <p className="px-5 py-6 text-center text-sm text-slate-500">
          No visits recorded yet.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {shown.map((visit) => (
              <li
                key={visit.id}
                className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
              >
                <span className="text-slate-700">{formatDate(visit.date)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 tabular-nums">
                    {formatTime(visit.checkedInAt, timezone)}
                  </span>
                  <Badge tone={visit.source === 'APP' ? 'indigo' : 'slate'}>
                    {CHECK_IN_SOURCE_LABELS[visit.source]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
          {visits.length > SHOWN && (
            <div className="border-t border-slate-100 px-5 py-2">
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                className="text-sm font-medium text-indigo-700 hover:underline"
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
