import { request } from './client';
import type {
  CreateMemberInput,
  DeactivateMemberInput,
  Gym,
  Member,
  MemberListParams,
  OtpSendResponse,
  OtpVerifyResponse,
  Paginated,
  UpdateMemberInput,
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
