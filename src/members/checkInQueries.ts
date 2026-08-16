import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkIns, gyms } from '../api/endpoints';
import { memberKeys } from './queries';

export const checkInKeys = {
  all: ['check-ins'] as const,
  day: (date: string) => ['check-ins', 'day', date] as const,
  forMember: (memberId: string) => ['check-ins', 'member', memberId] as const,
};

/**
 * The gym's own day, not the browser's. Check-in days are computed from the
 * gym's timezone, so a desk machine set to another zone must not disagree with
 * the register about what "today" is.
 */
export function useGymToday(): string {
  const gym = useQuery({
    queryKey: ['gym', 'current'],
    queryFn: gyms.current,
    staleTime: 10 * 60 * 1000,
  });
  return dateInTimeZone(gym.data?.timezone);
}

/** `YYYY-MM-DD` in the given IANA zone, falling back to the browser's. */
export function dateInTimeZone(timeZone: string | undefined, when: Date = new Date()): string {
  try {
    // en-CA renders as YYYY-MM-DD, which is exactly what the API wants.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(when);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(when);
  }
}

/** Shift a `YYYY-MM-DD` string by whole days without tripping over timezones. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function useDayRegister(date: string) {
  return useQuery({
    queryKey: checkInKeys.day(date),
    queryFn: () => checkIns.forDay(date),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    placeholderData: (previous) => previous,
  });
}

export function useMemberCheckIns(memberId: string | undefined) {
  return useQuery({
    queryKey: checkInKeys.forMember(memberId ?? ''),
    queryFn: () => checkIns.forMember(memberId!),
    enabled: Boolean(memberId),
  });
}

/**
 * Recording a visit moves the register, the member's own history, and
 * `lastVisitAt` on the member record, so all three are refreshed.
 */
export function useRecordCheckIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => checkIns.record(memberId),
    onSuccess: (_result, memberId) => {
      queryClient.invalidateQueries({ queryKey: checkInKeys.all });
      queryClient.invalidateQueries({ queryKey: checkInKeys.forMember(memberId) });
      queryClient.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}
