import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { useToast } from '../components/Toast';
import { WakingServerNotice } from '../components/states';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { memberName, normalisePhone } from '../lib/format';
import { MemberDetailsFields } from '../members/MemberFormFields';
import {
  EMPTY_MEMBER_FORM,
  toCreatePayload,
  validateMemberForm,
} from '../members/form';
import type { MemberFormErrors, MemberFormValues } from '../members/form';
import { useCreateMember } from '../members/queries';

export function RegisterMemberPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [values, setValues] = useState<MemberFormValues>(EMPTY_MEMBER_FORM);
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [showDetails, setShowDetails] = useState(false);
  /** A 409 is a normal front-desk outcome, so it gets a banner, not a crash. */
  const [conflict, setConflict] = useState<string>();

  const create = useCreateMember();
  const slow = useSlowRequest(create.isPending);

  function change<K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    if (key === 'phone' || key === 'fullName') setConflict(undefined);
  }

  function submit() {
    const found = validateMemberForm(values, { requirePhone: true });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Open the details section if that's where the problem is.
      if (Object.keys(found).some((key) => key !== 'phone' && key !== 'fullName')) {
        setShowDetails(true);
      }
      return;
    }

    setConflict(undefined);
    create.mutate(toCreatePayload(values), {
      onSuccess: (member) => {
        toast.success(
          `${memberName(member)} registered${member.memberCode ? ` as ${member.memberCode}` : ''}.`,
        );
        navigate(`/members/${member.id}`, { replace: true });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.statusCode === 409) {
          setConflict(error.message);
          return;
        }
        if (error instanceof ApiError) {
          toast.error(error.message, error.errors);
          return;
        }
        toast.error('Could not register this member.');
      },
    });
  }

  return (
    <div className="max-w-3xl">
      <Link to="/members" className="text-xs text-slate-500 hover:text-slate-700">
        ← Members
      </Link>
      <h1 className="mt-2.5 text-2xl font-medium text-slate-900">Register a walk-in</h1>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-slate-600">
        Name and number are all you need. They don't need the app — the record waits for them if
        they sign in later.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="sq-panel mt-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Full name"
              required
              autoFocus
              autoComplete="off"
              maxLength={120}
              value={values.fullName}
              error={errors.fullName}
              disabled={create.isPending}
              onChange={(event) => change('fullName', event.target.value)}
            />
            <TextField
              label="Mobile number"
              required
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className="tnum block w-full rounded-md bg-white px-2.5 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-500 hover:ring-slate-400 focus:ring-2 focus:ring-indigo-600"
              value={values.phone}
              error={errors.phone}
              hint="10-digit Indian mobile, or +country code"
              disabled={create.isPending}
              onChange={(event) => change('phone', event.target.value)}
            />
          </div>

          {conflict && (
            <div role="alert" className="sq-note sq-note-bad mt-3.5">
              <p className="text-[13px] text-red-700">{conflict}</p>
              <p className="mt-1 text-xs text-slate-600">
                <button
                  type="button"
                  className="text-indigo-700 hover:underline"
                  onClick={() =>
                    navigate(`/members?search=${encodeURIComponent(normalisePhone(values.phone))}`)
                  }
                >
                  Open their record
                </button>{' '}
                instead — a duplicate number can't be registered twice.
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button type="submit" loading={create.isPending}>
              Register member
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/members')}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            {slow && create.isPending && <WakingServerNotice />}
          </div>
        </div>

        <div className="mt-4 rounded-md ring-1 ring-slate-300 ring-inset">
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-4.5 py-3.5 text-left"
          >
            <span>
              <span className="block text-[13px] text-slate-900">Additional details</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Email, date of birth, height and weight, goal, medical notes, emergency contact,
                front-desk notes
              </span>
            </span>
            <i
              className={`ph ph-caret-${showDetails ? 'up' : 'down'} shrink-0 text-base text-slate-500`}
              aria-hidden="true"
            />
          </button>
          {showDetails && (
            <div className="border-t border-slate-200 px-4.5 py-5">
              <MemberDetailsFields
                values={values}
                errors={errors}
                disabled={create.isPending}
                onChange={change}
              />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
