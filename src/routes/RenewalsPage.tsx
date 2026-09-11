import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { EmptyState, ErrorState, LoadingBlock } from '../components/states';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatDate, formatMoney, formatPhone, memberName } from '../lib/format';
import { useExpiringSubscriptions } from '../members/planQueries';
import { PAYMENT_STATUS_LABELS } from '../api/types';
import type { Subscription } from '../api/types';

/** The API caps the window at 90 days. */
const WINDOWS = [7, 15, 30, 60, 90];

/**
 * Groups the call list by how soon it matters. Working top to bottom is the
 * whole job, so the groups are the urgency and each row leads with the number
 * of days left and ends with the phone number.
 */
const GROUPS = [
  { title: 'Today and tomorrow', within: 1, tone: 'bad' as const },
  { title: 'This week', within: 7, tone: 'warn' as const },
  { title: 'Later', within: Infinity, tone: 'neutral' as const },
];

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

  // Each subscription lands in the first group whose window it falls inside.
  const grouped = GROUPS.map((group, index) => ({
    ...group,
    items: items.filter((item) => {
      const previous = index === 0 ? -Infinity : GROUPS[index - 1].within;
      return item.daysRemaining > previous && item.daysRemaining <= group.within;
    }),
  })).filter((group) => group.items.length > 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-2xl font-medium text-slate-900">Renewals</h1>
          <p className="mt-1 text-[13px] text-slate-600">
            {items.length === 0
              ? `Nothing running out in the next ${days} days.`
              : `${items.length} ${items.length === 1 ? 'call' : 'calls'} to make`}
            {owed > 0 && (
              <>
                {' · '}
                <span className="tnum text-amber-700">{formatMoney(owed)} outstanding</span> across
                them
              </>
            )}
          </p>
        </div>

        <div className="seg" role="group" aria-label="Look-ahead window">
          {WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === days}
              onClick={() => setParams({ days: String(value) })}
              className="seg-opt"
            >
              {value === WINDOWS[0] ? `${value} days` : value}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="mt-5 rounded-md bg-white shadow-[var(--shadow-sm)]">
          <LoadingBlock label="Loading renewals…" slow={slow} />
        </div>
      ) : query.isError ? (
        <div className="mt-5 rounded-md bg-white shadow-[var(--shadow-sm)]">
          <ErrorState
            error={query.error}
            onRetry={() => query.refetch()}
            retrying={query.isFetching}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-5 rounded-md bg-white shadow-[var(--shadow-sm)]">
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
        </div>
      ) : (
        <>
          {query.isFetching && (
            <p className="mt-3 text-xs text-slate-400" role="status">
              Updating…
            </p>
          )}
          {grouped.map((group) => (
            <section key={group.title}>
              <h2 className="sq-lbl mt-5.5 mb-2">{group.title}</h2>
              <div className="overflow-hidden rounded-md bg-white shadow-[var(--shadow-sm)]">
                {group.items.map((item, index) => (
                  <RenewalRow
                    key={item.id}
                    subscription={item}
                    tone={group.tone}
                    first={index === 0}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <p className="mt-5 text-xs text-slate-500">
        Cash in hand only — there is no payment gateway, so a renewal is recorded here after the
        money is taken at the desk.
      </p>
    </div>
  );
}

function RenewalRow({
  subscription,
  tone,
  first,
}: {
  subscription: Subscription;
  tone: 'bad' | 'warn' | 'neutral';
  first: boolean;
}) {
  const member = subscription.member;
  const spine = tone === 'neutral' ? 'var(--color-neutral-700)' : `var(--${tone})`;
  const figure = tone === 'neutral' ? 'var(--color-neutral-300)' : `var(--${tone}-txt)`;

  return (
    <div
      className={`flex flex-wrap items-center gap-4.5 px-4.5 py-3.5 ${first ? '' : 'border-t border-slate-200'}`}
      style={{ borderLeft: `3px solid ${spine}` }}
    >
      <div className="w-11 shrink-0 text-center">
        <p className="tnum text-xl" style={{ color: figure }}>
          {Math.max(0, subscription.daysRemaining)}
        </p>
        <p className="text-[10px] text-slate-500">
          {subscription.daysRemaining === 1 ? 'day' : 'days'}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link
            to={`/members/${member?.id ?? subscription.memberId}`}
            className="text-indigo-700 hover:underline"
          >
            {member ? memberName(member) : 'View member'}
          </Link>
          {member?.memberCode && (
            <span className="tnum ml-2 text-xs text-slate-500">{member.memberCode}</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {subscription.planName} · ends {formatDate(subscription.endDate)} ·{' '}
          {subscription.balance > 0 ? (
            <span className="tnum text-amber-700">
              {formatMoney(subscription.balance)} owing,{' '}
              {PAYMENT_STATUS_LABELS[subscription.paymentStatus].toLowerCase()}
            </span>
          ) : (
            'no balance'
          )}
        </p>
      </div>

      {member && (
        <a
          href={`tel:${member.phone}`}
          className="tnum flex items-center gap-1.5 text-sm text-indigo-700 hover:underline"
        >
          <i className="ph ph-phone text-[15px]" aria-hidden="true" />
          {formatPhone(member.phone)}
        </a>
      )}

      <Link to={`/members/${member?.id ?? subscription.memberId}`}>
        <Button size="sm">Renew</Button>
      </Link>
    </div>
  );
}
