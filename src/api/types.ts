/**
 * Single source of truth for backend types. Mirrors brief sections 5 and 6
 * exactly — do not add fields the API does not document, since the API rejects
 * unknown fields with a 400.
 */

// ---------------------------------------------------------------- enums (§6)

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';
export type FitnessGoal =
  | 'WEIGHT_LOSS'
  | 'MUSCLE_GAIN'
  | 'GENERAL_FITNESS'
  | 'ENDURANCE'
  | 'REHAB';
export type ActivityLevel = 'BEGINNER' | 'OCCASIONAL' | 'REGULAR';
export type GymUserStatus = 'ACTIVE' | 'SUSPENDED' | 'LEFT';
export type MemberSource = 'APP_SIGNUP' | 'FRONT_DESK' | 'IMPORT';
export type GymRole = 'MEMBER' | 'TRAINER' | 'GYM_ADMIN' | 'OWNER';

export type DurationUnit = 'DAY' | 'MONTH';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'ONLINE' | 'OTHER';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING';
export type SubscriptionStatus = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';
export type CheckInSource = 'APP' | 'FRONT_DESK';

/** Roles allowed to use this portal. Anything else gets 403 on every call. */
export const STAFF_ROLES: readonly GymRole[] = ['GYM_ADMIN', 'OWNER'];

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  UNDISCLOSED: 'Prefer not to say',
};

export const GOAL_LABELS: Record<FitnessGoal, string> = {
  WEIGHT_LOSS: 'Weight loss',
  MUSCLE_GAIN: 'Muscle gain',
  GENERAL_FITNESS: 'General fitness',
  ENDURANCE: 'Endurance',
  REHAB: 'Rehab',
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  BEGINNER: 'Beginner',
  OCCASIONAL: 'Occasional',
  REGULAR: 'Regular',
};

export const STATUS_LABELS: Record<GymUserStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  LEFT: 'Left',
};

export const SOURCE_LABELS: Record<MemberSource, string> = {
  FRONT_DESK: 'Front desk',
  APP_SIGNUP: 'App signup',
  IMPORT: 'Import',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
  OTHER: 'Other',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: 'Paid',
  PARTIAL: 'Part paid',
  PENDING: 'Unpaid',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Active',
  UPCOMING: 'Upcoming',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export const CHECK_IN_SOURCE_LABELS: Record<CheckInSource, string> = {
  APP: 'App',
  FRONT_DESK: 'Front desk',
};

export const ROLE_LABELS: Record<GymRole, string> = {
  MEMBER: 'Member',
  TRAINER: 'Trainer',
  GYM_ADMIN: 'Gym admin',
  OWNER: 'Owner',
};

// ----------------------------------------------------------------- auth (§3)

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string | null;
  role: GymRole;
  memberCode: string | null;
  onboarded: boolean;
}

export interface AuthGym {
  id: string;
  code: string;
  name: string;
}

export interface OtpSendResponse {
  phone: string;
  expiresAt: string;
  /** Only present when the backend runs with dev OTP enabled. */
  devCode?: string;
}

export interface OtpVerifyResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
  user: AuthUser;
  gym: AuthGym;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ------------------------------------------------------------------ gym (§4)

export interface Gym {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  logoUrl: string;
  timezone: string;
  currency: string;
}

// -------------------------------------------------------------- members (§5)

export interface Member {
  /** Membership id — this is what /members/:id takes, not `userId`. */
  id: string;
  /** Identifies the person. Unused by this portal. */
  userId: string;
  /** null for app signups that were never registered at the desk. */
  memberCode: string | null;
  /** App signups routinely have no name. Render via `memberName()`, never directly. */
  fullName: string | null;
  phone: string;
  email: string | null;
  /** Never null — `UNDISCLOSED` is how "not set" is represented. */
  gender: Gender;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: FitnessGoal | null;
  activityLevel: ActivityLevel | null;
  medicalNotes: string | null;
  notes: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  status: GymUserStatus;
  source: MemberSource;
  /** true once the person has logged into the mobile app. */
  hasAppAccount: boolean;
  onboarded: boolean;
  joinedAt: string;
  lastVisitAt: string | null;
  /** What they've bought. `null` means they never have — a lead. */
  membership: MemberMembership | null;
}

export type MemberSortBy = 'joinedAt' | 'fullName' | 'lastVisitAt';
export type SortOrder = 'asc' | 'desc';

/**
 * Filters the list by what the member has actually bought.
 *
 * `EXPIRING` is a SUBSET of `ACTIVE` — someone whose membership ends tomorrow is
 * still active today, so both count them. `ACTIVE_NOT_EXPIRING` is the disjoint
 * slice: `ACTIVE_NOT_EXPIRING + EXPIRING = ACTIVE`. Never derive totals by
 * summing these; use `GET /members/stats`.
 */
export type MembershipFilter =
  | 'ACTIVE'
  | 'EXPIRING'
  | 'ACTIVE_NOT_EXPIRING'
  | 'EXPIRED'
  | 'NONE';

export interface MemberListParams {
  search?: string;
  status?: GymUserStatus;
  source?: MemberSource;
  membershipStatus?: MembershipFilter;
  /** Window for `EXPIRING`. Default 7, max 90. */
  expiringInDays?: number;
  page?: number;
  /** Max 100. */
  limit?: number;
  sortBy?: MemberSortBy;
  sortOrder?: SortOrder;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** POST /members. Only phone and fullName are required. */
export interface CreateMemberInput {
  phone: string;
  fullName: string;
  email?: string;
  gender?: Gender;
  /** ISO date `YYYY-MM-DD`. */
  dateOfBirth?: string;
  heightCm?: number;
  weightKg?: number;
  goal?: FitnessGoal;
  activityLevel?: ActivityLevel;
  medicalNotes?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
}

/** PATCH /members/:id — same fields as create except `phone`, all optional. */
export type UpdateMemberInput = Partial<Omit<CreateMemberInput, 'phone'>>;

export interface DeactivateMemberInput {
  /** LEFT = quit, SUSPENDED = temporary block. Defaults to LEFT. */
  status?: Extract<GymUserStatus, 'LEFT' | 'SUSPENDED'>;
  reason?: string;
}

// ------------------------------------------------- plans & memberships (§5b)

/** What the gym sells. Plans are archived, never deleted. */
export interface Plan {
  id: string;
  name: string;
  description: string | null;
  durationValue: number;
  durationUnit: DurationUnit;
  /** Server-rendered, e.g. "3 months". */
  durationLabel: string;
  price: number;
  /** Sellable at the desk. */
  isActive: boolean;
  /** Also visible in the member app. */
  isPublic: boolean;
  sortOrder: number;
  archivedAt: string | null;
  /** Staff-only, and only returned by `GET /plans/:id`. */
  timesSold?: number;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  /** Integer 1–120. */
  durationValue: number;
  durationUnit: DurationUnit;
  /** 0–10,000,000. */
  price: number;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
}

export type UpdatePlanInput = Partial<CreatePlanInput>;

/**
 * A plan sold to a member. Name, price and duration are copied at the point of
 * sale, so editing the plan later never rewrites history. `status` is computed
 * from the dates on every read — there is no stored status to go stale.
 */
/** Who the membership belongs to. Present on `GET /subscriptions/expiring`. */
export interface SubscriptionMember {
  id: string;
  memberCode: string | null;
  fullName: string | null;
  phone: string;
}

export interface Subscription {
  id: string;
  memberId: string;
  planId: string;
  planName: string;
  durationLabel: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  /** 0 on the last valid day, negative once past. */
  daysRemaining: number;
  price: number;
  discount: number;
  amountDue: number;
  amountPaid: number;
  balance: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  notes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt?: string;
  /**
   * Only returned by `GET /subscriptions/expiring` — undocumented in the brief
   * but present, and what makes that route usable as a call list on its own.
   */
  member?: SubscriptionMember;
}

/** POST /members/:memberId/subscriptions — only `planId` is required. */
export interface CreateSubscriptionInput {
  planId: string;
  /**
   * ISO date. Omit it: the server defaults to today, or to the day after an
   * existing membership ends so a renewal loses no time. An explicit date that
   * overlaps is refused with a 409 naming the date to use instead.
   */
  startDate?: string;
  /** Overrides the plan's list price for this sale only. */
  price?: number;
  discount?: number;
  /** Defaults to the full amount due; less means PARTIAL with a balance owing. */
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

/** POST /subscriptions/:id/payment. `notes` is rejected here — amount and method only. */
export interface RecordPaymentInput {
  amount: number;
  paymentMethod?: PaymentMethod;
}

export interface CancelSubscriptionInput {
  reason?: string;
}

/**
 * The membership summary now carried by every member object. `null` when they
 * have never bought anything — that is the "lead" population.
 */
export interface MemberMembership {
  status: SubscriptionStatus;
  subscriptionId: string;
  planName: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  balance: number;
  /** Last day covered once a queued renewal is counted. */
  coveredUntil: string;
  hasRenewalQueued: boolean;
}

// ------------------------------------------------------- check-ins (§5c)

/**
 * One visit. There is no check-out, so this records arrival only — there is no
 * live occupancy to show, just who came in on a given day.
 */
export interface CheckIn {
  id: string;
  memberId: string;
  /** The gym's local day, computed from the gym's timezone rather than UTC. */
  date: string;
  checkedInAt: string;
  source: CheckInSource;
  /**
   * Only meaningful on the POST response: `true` means they were already checked
   * in today and this returned the existing visit rather than creating one.
   */
  alreadyCheckedIn: boolean;
  /** Present on the day register; absent from a member's own history. */
  member?: SubscriptionMember;
}

/** `GET /check-ins?date=` — the day's register. */
export interface CheckInDay {
  date: string;
  total: number;
  items: CheckIn[];
}

/**
 * `GET /members/stats` — the counts a dashboard needs, computed server-side.
 * `buckets` is a true partition and always sums to `totalMembers`.
 */
export interface MemberStats {
  totalMembers: number;
  /** The window `expiringSoon` was computed with. */
  expiringInDays: number;
  /** The headline "active members" figure. Includes `expiringSoon`. */
  activeTotal: number;
  buckets: {
    /** Live, and not inside the expiring window. Drill down with ACTIVE_NOT_EXPIRING. */
    active: number;
    expiringSoon: number;
    /** History but nothing live — lapsed and cancelled alike. */
    expired: number;
    /** Never bought anything: the app-signup population. */
    never: number;
  };
}

export interface MemberStatsParams {
  /** Default 7, max 90. */
  expiringInDays?: number;
  /** Narrow the population so the numbers match a filtered list. */
  status?: GymUserStatus;
  source?: MemberSource;
}
