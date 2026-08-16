import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChartCard } from '../components/charts/ChartCard';
import { BarChart, ColumnChart, StackedShareBar } from '../components/charts/Charts';
import type { Point } from '../components/charts/Charts';
import { VIZ } from '../components/charts/tokens';
import { ErrorState, LoadingBlock } from '../components/states';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatMoney } from '../lib/format';
import { useGymToday } from '../members/checkInQueries';
import {
  BUCKET_FILTERS,
  useAttendanceWindow,
  useExpiringHorizon,
  useMemberStats,
  usePlanSales,
} from '../members/insightQueries';

const ATTENDANCE_WINDOWS = [7, 14, 30];
/** One look-ahead window scopes both the expiring bucket and the renewals list. */
const LOOK_AHEAD = [7, 30, 60, 90];

/** In partition order, healthiest first — which is also the ordinal ramp order. */
const MIX_BUCKETS = [
  { key: 'active', title: 'Active' },
  { key: 'expiringSoon', title: 'Expiring soon' },
  { key: 'expired', title: 'Expired' },
  { key: 'never', title: 'Never bought' },
] as const;

/** Bucketed by urgency, so the ramp is ordinal rather than categorical. */
const RENEWAL_BUCKETS = [
  { key: 'week', title: 'Next 7 days', test: (days: number) => days <= 7 },
  { key: 'month', title: '8–30 days', test: (days: number) => days > 7 && days <= 30 },
  { key: 'later', title: '31+ days', test: (days: number) => days > 30 },
];

function shortDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric' }).format(parsed);
}

function longDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    parsed,
  );
}

/**
 * There is no statistics endpoint, so every figure here is assembled from the
 * member, check-in, subscription and plan routes. See `insightQueries.ts`.
 */
export function InsightsPage() {
  const [params, setParams] = useSearchParams();
  const attendanceDays = Number(params.get('days') ?? '14') || 14;
  const horizon = Number(params.get('horizon') ?? '7') || 7;

  const today = useGymToday();
  const stats = useMemberStats(horizon);
  const attendance = useAttendanceWindow(today, attendanceDays);
  const expiring = useExpiringHorizon(horizon);
  const planSales = usePlanSales();

  const buckets = stats.data?.buckets;
  const totalMembers = stats.data?.totalMembers ?? 0;
  const loading = stats.isLoading && attendance.isLoading;
  const slow = useSlowRequest(loading);

  const attendancePoints = useMemo<Point[]>(
    () =>
      attendance.days.map((day) => ({
        key: day.date,
        label: shortDay(day.date),
        title: longDay(day.date),
        value: day.total,
      })),
    [attendance.days],
  );

  const visitsInWindow = attendance.days.reduce((sum, day) => sum + day.total, 0);
  const busiest = attendance.days.reduce(
    (best, day) => (day.total > best.total ? day : best),
    { date: today, total: 0 },
  );

  const mixPoints = useMemo<Point[]>(
    () =>
      MIX_BUCKETS.map((bucket) => ({
        key: bucket.key,
        label: bucket.title,
        title: bucket.title,
        value: buckets?.[bucket.key] ?? 0,
      })),
    [buckets],
  );

  const renewals = expiring.data ?? [];
  const renewalPoints = useMemo<Point[]>(
    () =>
      RENEWAL_BUCKETS.map((bucket) => ({
        key: bucket.key,
        label: bucket.title,
        title: bucket.title,
        value: renewals.filter((item) => bucket.test(item.daysRemaining)).length,
      })),
    [renewals],
  );
  const owed = renewals.reduce((sum, item) => sum + item.balance, 0);
  const everBought = totalMembers - (buckets?.never ?? 0);
  const payingShare = totalMembers === 0 ? 0 : Math.round((everBought / totalMembers) * 100);

  const planPoints = useMemo<Point[]>(
    () =>
      [...planSales.plans]
        .sort((a, b) => (b.timesSold ?? 0) - (a.timesSold ?? 0))
        .map((plan) => ({
          key: plan.id,
          label: plan.name,
          title: plan.name,
          value: plan.timesSold ?? 0,
        })),
    [planSales.plans],
  );

  if (loading) return <LoadingBlock label="Building the numbers…" slow={slow} />;

  if (stats.isError) {
    return (
      <div className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <ErrorState error={stats.error} onRetry={() => stats.refetch()} retrying={stats.isFetching} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Insights</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Built from the member, check-in and plan records — there is no separate analytics
            feed, so these are live counts rather than a cached report.
          </p>
        </div>

        {/* One control row above everything it scopes, never inside a card. */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Attendance
            <select
              value={attendanceDays}
              onChange={(event) => {
                params.set('days', event.target.value);
                setParams(params);
              }}
              className="rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
            >
              {ATTENDANCE_WINDOWS.map((value) => (
                <option key={value} value={value}>
                  Last {value} days
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Look ahead
            <select
              value={horizon}
              onChange={(event) => {
                params.set('horizon', event.target.value);
                setParams(params);
              }}
              className="rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
            >
              {LOOK_AHEAD.map((value: number) => (
                <option key={value} value={value}>
                  Next {value} days
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Hero figure — exactly one per view. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">Active memberships</p>
          <p className="mt-1 text-5xl font-semibold text-slate-900">
            {stats.data?.activeTotal ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            of {totalMembers} {totalMembers === 1 ? 'person' : 'people'} linked to this gym ·
            includes those expiring soon
          </p>
        </div>
        <StatTile
          label={`Visits in ${attendanceDays} days`}
          value={String(visitsInWindow)}
          hint={`Busiest day: ${busiest.total}`}
          to="/check-ins"
        />
        <StatTile
          label="Expiring soon"
          value={String(buckets?.expiringSoon ?? 0)}
          hint={`Within ${horizon} days`}
          to={`/members?tab=EXPIRING&days=${horizon}`}
          tone={(buckets?.expiringSoon ?? 0) > 0 ? 'amber' : undefined}
        />
        <StatTile
          label="Outstanding balances"
          value={formatMoney(owed)}
          hint={`Owed on memberships expiring in ${horizon} days`}
          to="/renewals"
          tone={owed > 0 ? 'amber' : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <ChartCard
            title="Attendance"
            subtitle={`Check-ins per day over the last ${attendanceDays} days. Busiest: ${longDay(busiest.date)} with ${busiest.total}.`}
            stale={attendance.isFetching && !attendance.isLoading}
            columns={[{ label: 'Day' }, { label: 'Check-ins', align: 'right' }]}
            rows={attendance.days.map((day) => [longDay(day.date), day.total])}
            footer={
              <p className="text-xs text-slate-500">
                There is no date-range endpoint for check-ins, so this is one request per day —
                which is why the window stops at 30.
              </p>
            }
          >
            {attendance.error ? (
              <ErrorState error={attendance.error} onRetry={() => attendance.refetch()} />
            ) : (
              <ColumnChart points={attendancePoints} />
            )}
          </ChartCard>
        </div>

        <ChartCard
          title="Membership mix"
          subtitle={`Everyone linked to this gym, by what they've bought. Expiring soon means within ${horizon} days.`}
          stale={stats.isFetching && !stats.isLoading}
          columns={[{ label: 'State' }, { label: 'People', align: 'right' }]}
          rows={mixPoints.map((point) => [point.title, point.value])}
          footer={
            <p className="text-xs text-slate-500">
              {payingShare}% have bought a plan at some point. The rest are leads — mostly app
              signups auto-linked to the gym.{' '}
              <Link to="/members?tab=NONE" className="font-medium text-indigo-700 hover:underline">
                See them
              </Link>
            </p>
          }
        >
          <StackedShareBar
            points={mixPoints}
            colors={VIZ.ordinal4}
            total={totalMembers}
            hrefFor={(index) =>
              `/members?tab=${BUCKET_FILTERS[MIX_BUCKETS[index].key]}&days=${horizon}`
            }
          />
        </ChartCard>

        <ChartCard
          title="Renewals due"
          subtitle={`${renewals.length} membership${renewals.length === 1 ? '' : 's'} running out in the next ${horizon} days.`}
          stale={expiring.isFetching && !expiring.isLoading}
          columns={[{ label: 'When' }, { label: 'Memberships', align: 'right' }]}
          rows={renewalPoints.map((point) => [point.title, point.value])}
          footer={
            <Link to="/renewals" className="text-xs font-medium text-indigo-700 hover:underline">
              Open the call list →
            </Link>
          }
        >
          {expiring.isError ? (
            <ErrorState error={expiring.error} onRetry={() => expiring.refetch()} />
          ) : (
            <BarChart points={renewalPoints} colors={VIZ.ordinal3} />
          )}
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard
            title="Plan sales"
            subtitle="How many times each plan has been sold, all time."
            stale={planSales.isFetching && !planSales.isLoading}
            columns={[{ label: 'Plan' }, { label: 'Times sold', align: 'right' }]}
            rows={planPoints.map((point) => [point.title, point.value])}
          >
            {planPoints.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No plans yet.{' '}
                <Link to="/plans" className="font-medium text-indigo-700 hover:underline">
                  Add one
                </Link>{' '}
                to start selling memberships.
              </p>
            ) : (
              <BarChart points={planPoints} />
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  to,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  to: string;
  tone?: 'amber';
}) {
  return (
    <Link
      to={to}
      className="block rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 transition-colors hover:ring-indigo-300"
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </Link>
  );
}
