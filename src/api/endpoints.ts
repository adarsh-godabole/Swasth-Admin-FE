import { request } from './client';
import type {
  CancelSubscriptionInput,
  CreateMemberInput,
  CreatePlanInput,
  CreateSubscriptionInput,
  DeactivateMemberInput,
  Gym,
  Member,
  MemberListParams,
  OtpSendResponse,
  OtpVerifyResponse,
  Paginated,
  Plan,
  RecordPaymentInput,
  Subscription,
  UpdateMemberInput,
  UpdatePlanInput,
} from './types';

// ----------------------------------------------------------------- auth (§3)

export const auth = {
  sendOtp(phone: string) {
    return request<OtpSendResponse>('/auth/otp/send', {
      method: 'POST',
      body: { phone },
      auth: false,
    });
  },

  verifyOtp(phone: string, code: string) {
    return request<OtpVerifyResponse>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, code },
      auth: false,
    });
  },

  logout(refreshToken: string) {
    return request<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      auth: false,
      gym: false,
    });
  },
};

// ------------------------------------------------------------------ gym (§4)

export const gyms = {
  /** No auth required — usable on the login screen. */
  current() {
    return request<Gym>('/gyms/current', { auth: false });
  },
};

// -------------------------------------------------------------- members (§5)

export const members = {
  list(params: MemberListParams = {}) {
    return request<Paginated<Member>>('/members', { query: { ...params } });
  },

  get(id: string) {
    return request<Member>(`/members/${id}`);
  },

  create(input: CreateMemberInput) {
    return request<Member>('/members', { method: 'POST', body: input });
  },

  update(id: string, input: UpdateMemberInput) {
    return request<Member>(`/members/${id}`, { method: 'PATCH', body: input });
  },

  /** Also logs the member out of the mobile app immediately. */
  deactivate(id: string, input: DeactivateMemberInput) {
    return request<Member>(`/members/${id}/deactivate`, { method: 'POST', body: input });
  },

  /** Restores ACTIVE and keeps the original member code. */
  reactivate(id: string) {
    return request<Member>(`/members/${id}/reactivate`, { method: 'POST', body: {} });
  },
};

// ------------------------------------------------------------- plans (§5b)

export const plans = {
  /** Staff see every plan, archived ones included. */
  list() {
    return request<Plan[]>('/plans');
  },

  /** Only this route carries `timesSold`. */
  get(id: string) {
    return request<Plan>(`/plans/${id}`);
  },

  create(input: CreatePlanInput) {
    return request<Plan>('/plans', { method: 'POST', body: input });
  },

  update(id: string, input: UpdatePlanInput) {
    return request<Plan>(`/plans/${id}`, { method: 'PATCH', body: input });
  },

  /** Takes it off sale but keeps the history of what was already sold. */
  archive(id: string) {
    return request<Plan>(`/plans/${id}/archive`, { method: 'POST', body: {} });
  },

  restore(id: string) {
    return request<Plan>(`/plans/${id}/restore`, { method: 'POST', body: {} });
  },
};

// ----------------------------------------------------- subscriptions (§5b)

export const subscriptions = {
  /** Newest first. */
  forMember(memberId: string) {
    return request<Subscription[]>(`/members/${memberId}/subscriptions`);
  },

  sell(memberId: string, input: CreateSubscriptionInput) {
    return request<Subscription>(`/members/${memberId}/subscriptions`, {
      method: 'POST',
      body: input,
    });
  },

  recordPayment(id: string, input: RecordPaymentInput) {
    return request<Subscription>(`/subscriptions/${id}/payment`, {
      method: 'POST',
      body: input,
    });
  },

  cancel(id: string, input: CancelSubscriptionInput = {}) {
    return request<Subscription>(`/subscriptions/${id}/cancel`, {
      method: 'POST',
      body: input,
    });
  },

  /** The follow-up call list. `days` defaults to 7, max 90. */
  expiring(days = 7) {
    return request<Subscription[]>('/subscriptions/expiring', { query: { days } });
  },
};
