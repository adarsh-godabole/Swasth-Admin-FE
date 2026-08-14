import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plans, subscriptions } from '../api/endpoints';
import { memberKeys } from './queries';
import type {
  CancelSubscriptionInput,
  CreatePlanInput,
  CreateSubscriptionInput,
  RecordPaymentInput,
  Subscription,
  UpdatePlanInput,
} from '../api/types';

export const planKeys = {
  all: ['plans'] as const,
  list: () => ['plans', 'list'] as const,
  detail: (id: string) => ['plans', 'detail', id] as const,
};

export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  forMember: (memberId: string) => ['subscriptions', 'member', memberId] as const,
  expiring: (days: number) => ['subscriptions', 'expiring', days] as const,
};

export function usePlans() {
  return useQuery({
    queryKey: planKeys.list(),
    queryFn: plans.list,
    // Plans change rarely and are needed on every sale.
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlanInput) => plans.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePlanInput }) => plans.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function useArchivePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? plans.restore(id) : plans.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function useMemberSubscriptions(memberId: string | undefined) {
  return useQuery({
    queryKey: subscriptionKeys.forMember(memberId ?? ''),
    queryFn: () => subscriptions.forMember(memberId!),
    enabled: Boolean(memberId),
  });
}

export function useExpiringSubscriptions(days: number) {
  return useQuery({
    queryKey: subscriptionKeys.expiring(days),
    queryFn: () => subscriptions.expiring(days),
    placeholderData: (previous) => previous,
  });
}

/**
 * Any change to a subscription changes the member's `membership` summary and the
 * expiring list too, so all three are refreshed together.
 */
function useSubscriptionMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  memberId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.forMember(memberId) });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.expiring(7) });
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      queryClient.invalidateQueries({ queryKey: memberKeys.all });
      queryClient.invalidateQueries({ queryKey: planKeys.all });
    },
  });
}

export function useSellPlan(memberId: string) {
  return useSubscriptionMutation<CreateSubscriptionInput, Subscription>(
    (input) => subscriptions.sell(memberId, input),
    memberId,
  );
}

export function useRecordPayment(memberId: string) {
  return useSubscriptionMutation<{ id: string; input: RecordPaymentInput }, Subscription>(
    ({ id, input }) => subscriptions.recordPayment(id, input),
    memberId,
  );
}

export function useCancelSubscription(memberId: string) {
  return useSubscriptionMutation<{ id: string; input: CancelSubscriptionInput }, Subscription>(
    ({ id, input }) => subscriptions.cancel(id, input),
    memberId,
  );
}
