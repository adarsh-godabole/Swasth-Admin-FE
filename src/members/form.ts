import { isValidPhone, normalisePhone } from '../lib/format';
import type { ActivityLevel, CreateMemberInput, FitnessGoal, Gender, Member } from '../api/types';

/**
 * Form state is all strings — that's what inputs give us. `toPayload` converts
 * and, crucially, omits blank optional fields entirely: the API rejects unknown
 * fields with a 400 and does not want `null` or `""` for an absent value.
 */
export interface MemberFormValues {
  phone: string;
  fullName: string;
  email: string;
  gender: '' | Gender;
  dateOfBirth: string;
  heightCm: string;
  weightKg: string;
  goal: '' | FitnessGoal;
  activityLevel: '' | ActivityLevel;
  medicalNotes: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  notes: string;
}

export const EMPTY_MEMBER_FORM: MemberFormValues = {
  phone: '',
  fullName: '',
  email: '',
  gender: '',
  dateOfBirth: '',
  heightCm: '',
  weightKg: '',
  goal: '',
  activityLevel: '',
  medicalNotes: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  notes: '',
};

export type MemberFormErrors = Partial<Record<keyof MemberFormValues, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors the API's validation table so staff see problems before a round trip. */
export function validateMemberForm(
  values: MemberFormValues,
  options: { requirePhone: boolean },
): MemberFormErrors {
  const errors: MemberFormErrors = {};

  if (options.requirePhone) {
    const phone = normalisePhone(values.phone);
    if (!phone) errors.phone = 'Phone number is required.';
    else if (phone.length < 6 || phone.length > 20)
      errors.phone = 'Phone number must be 6–20 characters.';
    else if (!isValidPhone(phone))
      errors.phone = 'Enter a 10-digit Indian mobile number, or a number starting with +.';
  }

  const fullName = values.fullName.trim();
  if (!fullName) errors.fullName = 'Full name is required.';
  else if (fullName.length < 2 || fullName.length > 120)
    errors.fullName = 'Full name must be 2–120 characters.';

  const email = values.email.trim();
  if (email) {
    if (!EMAIL.test(email)) errors.email = 'Enter a valid email address.';
    else if (email.length > 255) errors.email = 'Email must be 255 characters or fewer.';
  }

  if (values.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth)) {
    errors.dateOfBirth = 'Use the date picker, or type YYYY-MM-DD.';
  } else if (values.dateOfBirth && new Date(values.dateOfBirth) > new Date()) {
    errors.dateOfBirth = 'Date of birth cannot be in the future.';
  }

  const height = checkNumber(values.heightCm, 50, 280, 'Height');
  if (height) errors.heightCm = height;

  const weight = checkNumber(values.weightKg, 20, 500, 'Weight');
  if (weight) errors.weightKg = weight;

  if (values.medicalNotes.length > 1000)
    errors.medicalNotes = 'Medical notes must be 1000 characters or fewer.';
  if (values.notes.length > 1000) errors.notes = 'Notes must be 1000 characters or fewer.';
  if (values.emergencyContactName.trim().length > 120)
    errors.emergencyContactName = 'Name must be 120 characters or fewer.';

  const emergencyPhone = normalisePhone(values.emergencyContactPhone);
  if (emergencyPhone && emergencyPhone.length > 20)
    errors.emergencyContactPhone = 'Phone number must be 20 characters or fewer.';

  return errors;
}

function checkNumber(raw: string, min: number, max: number, label: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (value < min || value > max) return `${label} must be between ${min} and ${max}.`;
  if (/\.\d{3,}$/.test(trimmed)) return `${label} allows at most 2 decimal places.`;
  return undefined;
}

/** Build a create payload, omitting every blank optional field. */
export function toCreatePayload(values: MemberFormValues): CreateMemberInput {
  const payload: CreateMemberInput = {
    phone: normalisePhone(values.phone),
    fullName: values.fullName.trim(),
  };

  const text = (value: string) => (value.trim() ? value.trim() : undefined);
  const assign = <K extends keyof CreateMemberInput>(key: K, value: CreateMemberInput[K]) => {
    if (value !== undefined) payload[key] = value;
  };

  assign('email', text(values.email));
  assign('gender', values.gender || undefined);
  assign('dateOfBirth', text(values.dateOfBirth));
  assign('heightCm', numberOrUndefined(values.heightCm));
  assign('weightKg', numberOrUndefined(values.weightKg));
  assign('goal', values.goal || undefined);
  assign('activityLevel', values.activityLevel || undefined);
  assign('medicalNotes', text(values.medicalNotes));
  assign('emergencyContactName', text(values.emergencyContactName));
  assign('emergencyContactPhone', values.emergencyContactPhone.trim()
    ? normalisePhone(values.emergencyContactPhone)
    : undefined);
  assign('notes', text(values.notes));

  return payload;
}

function numberOrUndefined(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Prefill the form from an existing member. */
export function fromMember(member: Member): MemberFormValues {
  return {
    phone: member.phone,
    fullName: member.fullName ?? '',
    email: member.email ?? '',
    gender: member.gender ?? '',
    dateOfBirth: member.dateOfBirth ? member.dateOfBirth.slice(0, 10) : '',
    heightCm: member.heightCm === null ? '' : String(member.heightCm),
    weightKg: member.weightKg === null ? '' : String(member.weightKg),
    goal: member.goal ?? '',
    activityLevel: member.activityLevel ?? '',
    medicalNotes: member.medicalNotes ?? '',
    emergencyContactName: member.emergencyContactName ?? '',
    emergencyContactPhone: member.emergencyContactPhone ?? '',
    notes: member.notes ?? '',
  };
}

/**
 * Diff against the original so PATCH sends only what changed. Clearing a field
 * is sent as `null`, which is the documented contract — `""` is rejected on
 * validated fields. Sending `gender: null` resets it to `UNDISCLOSED`, since the
 * column is not nullable.
 */
export function toUpdatePayload(
  values: MemberFormValues,
  original: MemberFormValues,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const keys = Object.keys(values) as (keyof MemberFormValues)[];

  for (const key of keys) {
    if (key === 'phone') continue; // phone is the login identity and cannot change here
    const next = values[key].trim();
    const before = original[key].trim();
    if (next === before) continue;

    if (next === '') {
      patch[key] = null;
      continue;
    }

    if (key === 'heightCm' || key === 'weightKg') patch[key] = Number(next);
    else if (key === 'emergencyContactPhone') patch[key] = normalisePhone(next);
    else patch[key] = next;
  }

  return patch;
}
