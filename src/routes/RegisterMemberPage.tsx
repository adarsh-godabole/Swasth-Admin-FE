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
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link to="/members" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to members
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Register member</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Name and phone number are all you need. The member doesn't need the app installed — their
          record waits for them if they sign in later.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
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
              value={values.phone}
              error={errors.phone}
              hint="10-digit Indian mobile, or +country code"
              disabled={create.isPending}
              onChange={(event) => change('phone', event.target.value)}
            />
          </div>

          {conflict && (
            <div
              role="alert"
              className="mt-4 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset"
            >
              <p className="font-medium">{conflict}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/members?tab=ALL&search=${encodeURIComponent(normalisePhone(values.phone))}`,
                    )
                  }
                >
                  Find this member
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((current) => !current)}
            className="flex w-full items-center justify-between px-5 py-3 text-left"
          >
            <span className="text-sm font-medium text-slate-800">Additional details</span>
            <span className="text-xs text-slate-500">
              {showDetails ? 'Hide' : 'Optional — add now or later'}{' '}
              <span aria-hidden="true">{showDetails ? '▲' : '▼'}</span>
            </span>
          </button>
          {showDetails && (
            <div className="border-t border-slate-200 px-5 py-5">
              <MemberDetailsFields
                values={values}
                errors={errors}
                disabled={create.isPending}
                onChange={change}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={create.isPending}>
            Register member
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate('/members')}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          {slow && create.isPending && <WakingServerNotice />}
        </div>
      </form>
    </div>
  );
}
