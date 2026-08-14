import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { members } from '../api/endpoints';
import type {
  CreateMemberInput,
  DeactivateMemberInput,
  Member,
  MemberListParams,
  UpdateMemberInput,
} from '../api/types';

export const memberKeys = {
  all: ['members'] as const,
  list: (params: MemberListParams) => ['members', 'list', params] as const,
  detail: (id: string) => ['members', 'detail', id] as const,
};

export function useMemberList(params: MemberListParams) {
  return useQuery({
    queryKey: memberKeys.list(params),
    queryFn: () => members.list(params),
    // Keep the previous page on screen while the next one loads.
    placeholderData: (previous) => previous,
  });
}

export function useMember(id: string | undefined) {
  return useQuery({
    queryKey: memberKeys.detail(id ?? ''),
    queryFn: () => members.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMemberInput) => members.create(input),
    onSuccess: (member) => {
      queryClient.setQueryData(memberKeys.detail(member.id), member);
      queryClient.invalidateQueries({ queryKey: memberKeys.all });
    },
  });
}

export function useUpdateMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMemberInput) => members.update(id, input),
    onSuccess: (member) => onMemberChanged(queryClient, member),
  });
}

export function useDeactivateMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeactivateMemberInput) => members.deactivate(id, input),
    onSuccess: (member) => onMemberChanged(queryClient, member),
  });
}

export function useReactivateMember(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => members.reactivate(id),
    onSuccess: (member) => onMemberChanged(queryClient, member),
  });
}

function onMemberChanged(
  queryClient: ReturnType<typeof useQueryClient>,
  member: Member | undefined,
) {
  if (member?.id) queryClient.setQueryData(memberKeys.detail(member.id), member);
  queryClient.invalidateQueries({ queryKey: memberKeys.all });
}
