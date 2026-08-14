import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, LoadingBlock } from '../components/states';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatDate, formatDayCount, formatMoney, formatPhone } from '../lib/format';
import { useExpiringSubscriptions } from '../members/planQueries';
import { PAYMENT_STATUS_LABELS } from '../api/types';
import type { Subscription } from '../api/types';

/** The API caps the window at 90 days. */
const WINDOWS = [7, 15, 30, 60, 90];

/**
 * The follow-up call list: who is about to run out, in the order they run out.
 * Everything the desk needs to make the call is on the row.
 */
export function RenewalsPage() {
  const [params, setParams] = useSearchParams();
  const days = Number(params.get('days') ?? '7') || 7;

  const query = useExpiringSubscriptions(days);
  const slow = useSlowRequest(query.isLoading);

  const items = [...(query.data ?? [])].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const owed = items.reduce((sum, item) => sum + item.balance, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Renewals</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Memberships running out in the next {days} days, soonest first.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Window
          <select
            value={days}
            onChange={(event) => setParams({ days: event.target.value })}
            className="rounded-md bg-white px-2 py-2 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
          >
            {WINDOWS.map((value) => (
              <option key={value} value={value}>
                Next {value} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {items.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Stat label="To call" value={String(items.length)} />
          {owed > 0 && <Stat label="Outstanding balances" value={formatMoney(owed)} tone="amber" />}
        </div>
      )}

      <div className="mt-4 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {query.isLoading ? (
          <LoadingBlock label="Loading renewals…" slow={slow} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
        ) : items.length === 0 ? (
          <EmptyState
            title={`Nothing expiring in the next ${days} days`}
            description="Try a longer window, or enjoy the quiet."
            action={
              days < 90 ? (
                <Button variant="secondary" onClick={() => setParams({ days: '90' })}>
                  Look 90 days ahead
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {query.isFetching && (
              <p className="border-b border-slate-100 px-4 py-1.5 text-xs text-slate-400" role="status">
                Updating…
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <RenewalRow key={item.id} subscription={item} />
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' }) {
  return (
    <div
      className={`rounded-lg px-4 py-2 ring-1 ring-inset ${
        tone === 'amber' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-200'
      }`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function RenewalRow({ subscription }: { subscription: Subscription }) {
  const member = subscription.member;
  const urgent = subscription.daysRemaining <= 3;

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {member ? (
            <Link
              to={`/members/${member.id}`}
              className="font-medium text-indigo-700 hover:underline"
            >
              {member.fullName ?? 'Unnamed member'}
            </Link>
          ) : (
            <Link
              to={`/members/${subscription.memberId}`}
              className="font-medium text-indigo-700 hover:underline"
            >
              View member
            </Link>
          )}
          {member?.memberCode && (
            <span className="font-mono text-xs text-slate-500">{member.memberCode}</span>
          )}
          <Badge tone={urgent ? 'red' : 'amber'}>
            {subscription.daysRemaining === 0
              ? 'Ends today'
              : `${formatDayCount(subscription.daysRemaining)} left`}
          </Badge>
          {subscription.balance > 0 && (
            <Badge tone="amber">
              {formatMoney(subscription.balance)} owing ·{' '}
              {PAYMENT_STATUS_LABELS[subscription.paymentStatus]}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {subscription.planName} · ends {formatDate(subscription.endDate)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {member && (
          <a
            href={`tel:${member.phone}`}
            className="text-sm font-medium text-indigo-700 hover:underline"
          >
            {formatPhone(member.phone)}
          </a>
        )}
        <Link to={`/members/${member?.id ?? subscription.memberId}`}>
          <Button variant="secondary" size="sm">
            Renew
          </Button>
        </Link>
      </div>
    </li>
  );
}
