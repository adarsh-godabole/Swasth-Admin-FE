import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { StatusBadge } from '../components/Badge';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ErrorState, LoadingBlock, WakingServerNotice } from '../components/states';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatDate, formatPhone, initials, memberName } from '../lib/format';
import { MemberDetailsFields } from '../members/MemberFormFields';
import { MembershipPanel } from '../members/MembershipPanel';
import { VisitsPanel } from '../members/VisitsPanel';
import { fromMember, toUpdatePayload, validateMemberForm } from '../members/form';
import type { MemberFormErrors, MemberFormValues } from '../members/form';
import {
  useDeactivateMember,
  useMember,
  useReactivateMember,
  useUpdateMember,
} from '../members/queries';
import {
  ACTIVITY_LABELS,
  GENDER_LABELS,
  GOAL_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
} from '../api/types';
import type { Member } from '../api/types';

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const query = useMember(id);
  const slow = useSlowRequest(query.isLoading);

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<MemberFormValues | null>(null);
  const [errors, setErrors] = useState<MemberFormErrors>({});
  const [dialog, setDialog] = useState<'deactivate' | 'reactivate' | null>(null);

  const update = useUpdateMember(id!);
  const deactivate = useDeactivateMember(id!);
  const reactivate = useReactivateMember(id!);

  const member = query.data;

  // Reset the draft whenever the record changes underneath us.
  useEffect(() => {
    if (member) setValues(fromMember(member));
  }, [member]);

  if (query.isLoading) return <LoadingBlock label="Loading member…" slow={slow} />;

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.statusCode === 404;
    return (
      <div className="rounded-md bg-white shadow-[var(--shadow-sm)]">
        <ErrorState
          error={query.error}
          onRetry={notFound ? undefined : () => query.refetch()}
          retrying={query.isFetching}
        />
        <div className="flex justify-center pb-8">
          <Button variant="secondary" onClick={() => navigate('/members')}>
            Back to members
          </Button>
        </div>
      </div>
    );
  }

  if (!member || !values) return null;

  function change<K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) {
    setValues((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function cancelEdit() {
    if (member) setValues(fromMember(member));
    setErrors({});
    setEditing(false);
  }

  function saveEdit() {
    if (!values || !member) return;
    const original = fromMember(member);
    const found = validateMemberForm(values, { requirePhone: false });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const patch = toUpdatePayload(values, original);
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      toast.info('Nothing changed.');
      return;
    }

    update.mutate(patch, {
      onSuccess: () => {
        toast.success('Member updated.');
        setEditing(false);
      },
      onError: (error) => {
        if (error instanceof ApiError) toast.error(error.message, error.errors);
        else toast.error('Could not save these changes.');
      },
    });
  }

  return (
    <div>
      <Link to="/members" className="text-xs text-slate-500 hover:text-slate-700">
        ← Members
      </Link>

      <header className="mt-2.5 flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-3.5">
          <div
            className="flex size-11.5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[15px] text-indigo-800"
            style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent-800)' }}
          >
            {initials(member.fullName)}
          </div>
          <div>
            <h1 className="text-2xl font-medium text-slate-900">{memberName(member)}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <StatusBadge status={member.status} />
              <span className="tnum">
                {member.memberCode ?? 'No member code'} ·{' '}
                {SOURCE_LABELS[member.source].toLowerCase()} ·{' '}
                {member.hasAppAccount ? 'app installed' : 'no app yet'}
              </span>
            </p>
          </div>
        </div>

        {!editing && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            {member.status === 'ACTIVE' ? (
              <Button variant="danger" onClick={() => setDialog('deactivate')}>
                Deactivate
              </Button>
            ) : (
              <Button onClick={() => setDialog('reactivate')}>Reactivate</Button>
            )}
          </div>
        )}
      </header>

      {member.status !== 'ACTIVE' && (
        <p className="sq-note mt-4 text-[13px] text-slate-700">
          This member is <strong>{STATUS_LABELS[member.status].toLowerCase()}</strong> and cannot
          use the mobile app. Reactivating keeps their original member code.
        </p>
      )}

      {member.source === 'APP_SIGNUP' && !member.memberCode && (
        <p className="sq-note sq-note-accent mt-4 text-[13px] text-slate-600">
          This person signed up through the mobile app and has never been registered at the desk,
          so they have no member code. They may never have paid or visited.
        </p>
      )}

      {!editing && (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            <MembershipPanel member={member} />
            <VisitsPanel member={member} />
          </div>
          <div className="flex flex-col gap-4">
            <OnTheFloor member={member} />
            <ReadOnlyDetails member={member} />
          </div>
        </div>
      )}

      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveEdit();
          }}
          className="mt-5 space-y-4"
        >
          <div className="rounded-md bg-white p-5 shadow-[var(--shadow-sm)]">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Full name"
                required
                maxLength={120}
                value={values.fullName}
                error={errors.fullName}
                disabled={update.isPending}
                onChange={(event) => change('fullName', event.target.value)}
              />
              <TextField
                label="Mobile number"
                value={formatPhone(member.phone)}
                disabled
                readOnly
                hint="The phone number is the member's login identity and can't be changed here."
              />
            </div>
            <div className="mt-6 border-t border-slate-200 pt-5">
              <MemberDetailsFields
                values={values}
                errors={errors}
                disabled={update.isPending}
                onChange={change}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" loading={update.isPending}>
              Save changes
            </Button>
            <Button variant="secondary" onClick={cancelEdit} disabled={update.isPending}>
              Cancel
            </Button>
            {update.isPending && <span className="text-sm text-slate-500">Saving…</span>}
          </div>
        </form>
      ) : null}

      <DeactivateDialog
        member={member}
        open={dialog === 'deactivate'}
        pending={deactivate.isPending}
        onClose={() => setDialog(null)}
        onConfirm={(input) =>
          deactivate.mutate(input, {
            onSuccess: (updated) => {
              setDialog(null);
              toast.success(
                `${memberName(member)} is now ${STATUS_LABELS[updated?.status ?? input.status ?? 'LEFT'].toLowerCase()}.`,
              );
            },
            onError: (error) => {
              if (error instanceof ApiError) toast.error(error.message, error.errors);
              else toast.error('Could not deactivate this member.');
            },
          })
        }
      />

      <Modal
        open={dialog === 'reactivate'}
        title="Reactivate member"
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={reactivate.isPending}>
              Cancel
            </Button>
            <Button
              loading={reactivate.isPending}
              data-autofocus
              onClick={() =>
                reactivate.mutate(undefined, {
                  onSuccess: () => {
                    setDialog(null);
                    toast.success(`${memberName(member)} is active again.`);
                  },
                  onError: (error) => {
                    if (error instanceof ApiError) toast.error(error.message, error.errors);
                    else toast.error('Could not reactivate this member.');
                  },
                })
              }
            >
              Reactivate
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <strong>{memberName(member)}</strong> will be active again and able to use the mobile app.
          Their original member code {member.memberCode ? `(${member.memberCode}) ` : ''}is kept.
        </p>
        {reactivate.isPending && <div className="mt-3"><WakingServerNotice /></div>}
      </Modal>
    </div>
  );
}

/**
 * What a trainer needs before the member reaches the floor. It is the one card
 * on the page that takes the warning treatment — medical notes and an
 * emergency number are not reference data, they are things to act on.
 */
function OnTheFloor({ member }: { member: Member }) {
  const contact = member.emergencyContactName || member.emergencyContactPhone;

  return (
    <section
      className="rounded-md p-3.5"
      style={{
        background: 'linear-gradient(180deg, var(--bad-bg), var(--color-surface))',
        boxShadow: 'inset 0 0 0 1px var(--bad-br)',
      }}
    >
      <p className="sq-lbl" style={{ color: 'var(--bad-txt)' }}>
        On the floor
      </p>

      <div className="mt-3 flex gap-2.5">
        <i className="ph ph-first-aid-kit shrink-0 text-[17px] text-red-500" aria-hidden="true" />
        {member.medicalNotes ? (
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-slate-800">
            {member.medicalNotes}
          </p>
        ) : (
          <p className="text-[13px] text-slate-500">No medical notes recorded.</p>
        )}
      </div>

      <div className="mt-3.5 flex gap-2.5">
        <i className="ph ph-phone-call shrink-0 text-[17px] text-red-500" aria-hidden="true" />
        {contact ? (
          <p className="text-[13px] leading-relaxed text-slate-800">
            {member.emergencyContactName ?? 'Unnamed contact'}
            {member.emergencyContactPhone && (
              <>
                <br />
                <a
                  href={`tel:${member.emergencyContactPhone}`}
                  className="tnum text-indigo-700 hover:underline"
                >
                  {formatPhone(member.emergencyContactPhone)}
                </a>
              </>
            )}
          </p>
        ) : (
          <p className="text-[13px] text-slate-500">No emergency contact recorded.</p>
        )}
      </div>
    </section>
  );
}

function ReadOnlyDetails({ member }: { member: Member }) {
  const rows: { label: string; value: string; tnum?: boolean }[] = [
    { label: 'Phone', value: formatPhone(member.phone), tnum: true },
    { label: 'Email', value: member.email ?? '—' },
    { label: 'Gender', value: member.gender ? GENDER_LABELS[member.gender] : '—' },
    { label: 'Born', value: formatDate(member.dateOfBirth), tnum: true },
    {
      label: 'Height / weight',
      value:
        member.heightCm === null && member.weightKg === null
          ? '—'
          : [
              member.heightCm === null ? null : `${member.heightCm} cm`,
              member.weightKg === null ? null : `${member.weightKg} kg`,
            ]
              .filter(Boolean)
              .join(' · '),
      tnum: true,
    },
    {
      label: 'Goal',
      value:
        [
          member.goal ? GOAL_LABELS[member.goal] : null,
          member.activityLevel ? ACTIVITY_LABELS[member.activityLevel] : null,
        ]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    { label: 'Joined', value: formatDate(member.joinedAt), tnum: true },
    { label: 'Last visit', value: formatDate(member.lastVisitAt), tnum: true },
  ];

  return (
    <>
      <section className="rounded-md bg-white p-3.5 shadow-[var(--shadow-sm)]">
        <p className="sq-lbl">Details</p>
        <dl className="mt-3">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={`flex justify-between gap-3 py-1.5 ${
                index === rows.length - 1 ? '' : 'border-b border-slate-200'
              }`}
            >
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className={`text-right text-xs text-slate-800 ${row.tnum ? 'tnum' : ''}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-md bg-white p-3.5 shadow-[var(--shadow-sm)]">
        <p className="sq-lbl">Front-desk notes</p>
        {member.notes ? (
          <p className="mt-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-slate-700">
            {member.notes}
          </p>
        ) : (
          <p className="mt-2.5 text-[13px] text-slate-500">None.</p>
        )}
      </section>
    </>
  );
}

function DeactivateDialog({
  member,
  open,
  pending,
  onClose,
  onConfirm,
}: {
  member: Member;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (input: { status: 'LEFT' | 'SUSPENDED'; reason?: string }) => void;
}) {
  const [status, setStatus] = useState<'LEFT' | 'SUSPENDED'>('LEFT');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setStatus('LEFT');
      setReason('');
    }
  }, [open]);

  return (
    <Modal
      open={open}
      title={`Deactivate ${memberName(member)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => onConfirm({ status, reason: reason.trim() || undefined })}
          >
            {status === 'LEFT' ? 'Mark as left' : 'Suspend member'}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">What's happening?</legend>
        <div className="mt-2 space-y-2">
          <label
            className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
              status === 'LEFT' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200'
            }`}
          >
            <input
              type="radio"
              name="deactivate-status"
              value="LEFT"
              data-autofocus
              checked={status === 'LEFT'}
              onChange={() => setStatus('LEFT')}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">They've left</span>
              <span className="block text-xs text-slate-500">
                Permanent — they've quit the gym. Use this when someone cancels or moves away.
              </span>
            </span>
          </label>
          <label
            className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
              status === 'SUSPENDED' ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200'
            }`}
          >
            <input
              type="radio"
              name="deactivate-status"
              value="SUSPENDED"
              checked={status === 'SUSPENDED'}
              onChange={() => setStatus('SUSPENDED')}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Suspend them</span>
              <span className="block text-xs text-slate-500">
                Temporary block — e.g. unpaid dues or a disciplinary hold. Reactivate any time.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor="deactivate-reason" className="block text-sm font-medium text-slate-700">
          Reason <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="deactivate-reason"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Moved to Pune"
          className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
        />
        <p className="mt-1 text-xs text-slate-500">Appended to the member's notes.</p>
      </div>

      <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200 ring-inset">
        This immediately signs <strong>{memberName(member)}</strong> out of the Swasth mobile app.
      </p>
      {pending && (
        <div className="mt-3">
          <WakingServerNotice />
        </div>
      )}
    </Modal>
  );
}
