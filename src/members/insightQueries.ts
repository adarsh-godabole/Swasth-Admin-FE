import { useQueries, useQuery } from '@tanstack/react-query';
import { checkIns, members, plans, subscriptions } from '../api/endpoints';
import { checkInKeys, shiftDate } from './checkInQueries';
import { planKeys, subscriptionKeys } from './planQueries';
import { memberKeys } from './queries';
import type { MembershipFilter } from '../api/types';

/**
 * There is no dashboard statistics endpoint, and inventing one is off the table.
 * Everything here is assembled from routes that exist:
 *
 * - headline counts   → GET /members?limit=1&membershipStatus=… (read `total`)
 * - attendance trend  → GET /check-ins?date=… once per day in the window
 * - renewals due      → GET /subscriptions/expiring?days=90
 * - plan popularity   → GET /plans/:id, which carries `timesSold`
 */

export const MEMBERSHIP_FILTERS: MembershipFilter[] = ['ACTIVE', 'EXPIRING', 'EXPIRED', 'NONE'];

/**
 * One cheap request per bucket: limit=1 and read `total`, plus an unfiltered
 * call for the real population.
 *
 * `EXPIRING` is a SUBSET of `ACTIVE`, not a sibling — verified against the API:
 * selling a same-day plan moved ACTIVE 4→5 and EXPIRING 0→1 for one person. So
 * the four counts must never simply be summed, and the part-to-whole breakdown
 * carves expiring back out of active (`segments` below).
 */
export function useMembershipCounts() {
  return useQueries({
    queries: [
      ...MEMBERSHIP_FILTERS.map((membershipStatus) => ({
        queryKey: memberKeys.list({ limit: 1, membershipStatus }),
        queryFn: () => members.list({ limit: 1, membershipStatus }),
        staleTime: 60_000,
      })),
      {
        queryKey: memberKeys.list({ limit: 1 }),
        queryFn: () => members.list({ limit: 1 }),
        staleTime: 60_000,
      },
    ],
    combine: (results) => {
      const counts = Object.fromEntries(
        MEMBERSHIP_FILTERS.map((filter, index) => [filter, results[index].data?.total ?? 0]),
      ) as Record<MembershipFilter, number>;

      return {
        counts,
        total: results[MEMBERSHIP_FILTERS.length].data?.total ?? 0,
        /** Non-overlapping, so they add up to `total`. */
        segments: {
          ACTIVE: Math.max(0, counts.ACTIVE - counts.EXPIRING),
          EXPIRING: counts.EXPIRING,
          EXPIRED: counts.EXPIRED,
          NONE: counts.NONE,
        } as Record<MembershipFilter, number>,
        isLoading: results.some((result) => result.isLoading),
        isFetching: results.some((result) => result.isFetching),
        error: results.find((result) => result.error)?.error ?? null,
        refetch: () => results.forEach((result) => result.refetch()),
      };
    },
  });
}

/** The last `days` gym-local days, oldest first. */
export function buildDateWindow(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) => shiftDate(today, index - (days - 1)));
}

/**
 * One request per day — there is no range endpoint. They run in parallel and
 * each response is tiny, but the count is why the window is capped at 30.
 */
export function useAttendanceWindow(today: string, days: number) {
  const dates = buildDateWindow(today, days);

  return useQueries({
    queries: dates.map((date) => ({
      queryKey: checkInKeys.day(date),
      queryFn: () => checkIns.forDay(date),
      staleTime: 60_000,
    })),
    combine: (results) => ({
      days: dates.map((date, index) => ({ date, total: results[index].data?.total ?? 0 })),
      isLoading: results.some((result) => result.isLoading),
      isFetching: results.some((result) => result.isFetching),
      error: results.find((result) => result.error)?.error ?? null,
      refetch: () => results.forEach((result) => result.refetch()),
    }),
  });
}

export function useExpiringHorizon(days: number) {
  return useQuery({
    queryKey: subscriptionKeys.expiring(days),
    queryFn: () => subscriptions.expiring(days),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

/**
 * `timesSold` is only returned by `GET /plans/:id`, so the list is fanned out
 * into one request per plan rather than counted client-side.
 */
export function usePlanSales() {
  const list = useQuery({ queryKey: planKeys.list(), queryFn: plans.list, staleTime: 5 * 60 * 1000 });
  const ids = (list.data ?? []).map((plan) => plan.id);

  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: planKeys.detail(id),
      queryFn: () => plans.get(id),
      staleTime: 5 * 60 * 1000,
    })),
    combine: (results) => ({
      plans: results.map((result) => result.data).filter((plan) => plan !== undefined),
      isLoading: results.some((result) => result.isLoading),
      isFetching: results.some((result) => result.isFetching),
    }),
  });

  return {
    plans: details.plans,
    isLoading: list.isLoading || details.isLoading,
    isFetching: list.isFetching || details.isFetching,
    error: list.error,
    refetch: () => list.refetch(),
  };
}
