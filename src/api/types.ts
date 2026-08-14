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
  /**
   * The brief documents this as always present, but app signups who haven't
   * finished onboarding really do come back as null — verified against the
   * deployed API. Render it through `memberName()`, never directly.
   */
  fullName: string | null;
  phone: string;
  email: string | null;
  gender: Gender | null;
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
}

export type MemberSortBy = 'joinedAt' | 'fullName' | 'lastVisitAt';
export type SortOrder = 'asc' | 'desc';

export interface MemberListParams {
  search?: string;
  status?: GymUserStatus;
  source?: MemberSource;
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
