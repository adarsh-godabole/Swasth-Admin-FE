import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ErrorState, WakingServerNotice } from '../components/states';
import { formatDate, formatDayCount, formatMoney } from '../lib/format';
import { Spinner } from '../components/Spinner';
import {
  useCancelSubscription,
  useMemberSubscriptions,
  usePlans,
  useRecordPayment,
  useSellPlan,
} from './planQueries';
import { SUBSCRIPTION_TONES, canTakePayment, isCancellable } from './membership';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '../api/types';
import type {
  CreateSubscriptionInput,
  Member,
  PaymentMethod,
  PaymentStatus,
  Plan,
  Subscription,
} from '../api/types';

/** Today as `YYYY-MM-DD` in the browser's timezone, for date inputs. */
function todayInput(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * A 409 from a sale names the date to start instead:
 * "…Cancel it first, or start the new one on 2026-10-14."
 * Pull that out so staff can apply it with one click.
 */
function suggestedStartDate(message: string): string | undefined {
  const matches = message.match(/\d{4}-\d{2}-\d{2}/g);
  return matches?.[matches.length - 1];
}

export function MembershipPanel({ member }: { member: Member }) {
  const toast = useToast();
  const history = useMemberSubscriptions(member.id);
  const [selling, setSelling] = useState(false);
  const [paying, setPaying] = useState<Subscription | null>(null);
  const [cancelling, setCancelling] = useState<Subscription | null>(null);

  const sell = useSellPlan(member.id);
  const payment = useRecordPayment(member.id);
  const cancel = useCancelSubscription(member.id);

  const subscriptions = history.data ?? [];
  const current = subscriptions.find((s) => s.status === 'ACTIVE');
  const upcoming = subscriptions.find((s) => s.status === 'UPCOMING');
  /**
   * Anything finished. Live memberships are shown in the card above with their
   * own actions, so they are deliberately not repeated down here — showing the
   * same membership twice was the thing that made the two sections unreadable.
   */
  const past = subscriptions.filter(
    (s) => s.status === 'EXPIRED' || s.status === 'CANCELLED',
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-md bg-white shadow-[var(--shadow-sm)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4.5 py-3">
          <div>
            <h2 className="sq-lbl">Current membership</h2>
            <p className="mt-1 text-xs text-slate-500">
              Cash is recorded by hand — there is no payment gateway.
            </p>
          </div>
          <Button size="sm" onClick={() => setSelling(true)}>
            {current ? 'Sell another plan' : 'Sell a plan'}
          </Button>
        </header>

        {history.isLoading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-500" role="status">
            <Spinner className="size-4 text-indigo-600" />
            Loading membership…
          </div>
        ) : history.isError ? (
          <ErrorState
            error={history.error}
            onRetry={() => history.refetch()}
            retrying={history.isFetching}
          />
        ) : !current && !upcoming ? (
          <p className="px-5 py-8 text-center text-[13px] text-slate-500">
            No membership. This person has never bought a plan — they're a lead, not a paying
            member.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {current && (
              <LiveMembership
                subscription={current}
                eyebrow="Active now"
                onPay={() => setPaying(current)}
                onCancel={() => setCancelling(current)}
              />
            )}
            {upcoming && (
              <LiveMembership
                subscription={upcoming}
                eyebrow={current ? 'Renewal queued — starts when the current one ends' : 'Starts later'}
                onPay={() => setPaying(upcoming)}
                onCancel={() => setCancelling(upcoming)}
              />
            )}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="overflow-hidden rounded-md bg-white shadow-[var(--shadow-sm)]">
          <header className="border-b border-slate-200 px-4.5 py-3">
            <h2 className="sq-lbl">Past memberships · {past.length}</h2>
          </header>
          <ul className="divide-y divide-slate-200">
            {past.map((subscription) => (
              <PastMembershipRow key={subscription.id} subscription={subscription} />
            ))}
          </ul>
        </section>
      )}

      <SellPlanDialog
        member={member}
        open={selling}
        pending={sell.isPending}
        onClose={() => setSelling(false)}
        onSubmit={(input, onConflict) =>
          sell.mutate(input, {
            onSuccess: (subscription) => {
              setSelling(false);
              toast.success(
                subscription.status === 'UPCOMING'
                  ? `${subscription.planName} queued from ${formatDate(subscription.startDate)}.`
                  : `${subscription.planName} sold — runs to ${formatDate(subscription.endDate)}.`,
              );
            },
            onError: (error) => {
              if (error instanceof ApiError && error.statusCode === 409) {
                onConflict(error.message);
                return;
              }
              if (error instanceof ApiError) toast.error(error.message, error.errors);
              else toast.error('Could not sell this plan.');
            },
          })
        }
      />

      <PaymentDialog
        subscription={paying}
        pending={payment.isPending}
        onClose={() => setPaying(null)}
        onSubmit={(input) => {
          if (!paying) return;
          payment.mutate(
            { id: paying.id, input },
            {
              onSuccess: (updated) => {
                setPaying(null);
                toast.success(
                  updated.balance > 0
                    ? `Payment recorded. ${formatMoney(updated.balance)} still owing.`
                    : 'Payment recorded — paid in full.',
                );
              },
              onError: (error) => {
                if (error instanceof ApiError) toast.error(error.message, error.errors);
                else toast.error('Could not record the payment.');
              },
            },
          );
        }}
      />

      <CancelDialog
        subscription={cancelling}
        pending={cancel.isPending}
        onClose={() => setCancelling(null)}
        onSubmit={(reason) => {
          if (!cancelling) return;
          cancel.mutate(
            { id: cancelling.id, input: reason ? { reason } : {} },
            {
              onSuccess: () => {
                setCancelling(null);
                toast.success(`${cancelling.planName} cancelled.`);
              },
              onError: (error) => {
                if (error instanceof ApiError) toast.error(error.message, error.errors);
                else toast.error('Could not cancel this membership.');
              },
            },
          );
        }}
      />
    </div>
  );
}

/** How far through the term we are, for the progress bar. */
function elapsedFraction(subscription: Subscription): number {
  const start = new Date(subscription.startDate).getTime();
  const end = new Date(subscription.endDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const now = Date.now();
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

/** Settled reads as calm, anything owing reads as a thing to collect. */
const PAYMENT_COLOURS: Record<PaymentStatus, string> = {
  PAID: 'var(--ok-txt)',
  PARTIAL: 'var(--warn-txt)',
  PENDING: 'var(--bad-txt)',
};

/**
 * A membership that is running or about to. Given real weight — plan name, a
 * countdown, and its own actions — because it is what the desk acts on.
 */
function LiveMembership({
  subscription,
  eyebrow,
  onPay,
  onCancel,
}: {
  subscription: Subscription;
  eyebrow: string;
  onPay: () => void;
  onCancel: () => void;
}) {
  const active = subscription.status === 'ACTIVE';
  const expiringSoon = active && subscription.daysRemaining <= 7;
  // One accent per membership: green while there is room, amber once the
  // countdown matters, and the accent hue for anything not yet started.
  const tone = active ? (expiringSoon ? 'warn' : 'ok') : null;
  const figure = tone ? `var(--${tone}-txt)` : 'var(--color-accent-300)';

  return (
    <div className="px-4.5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="sq-lbl">{eyebrow}</p>
          <h3 className="mt-1.5 text-xl font-medium text-slate-900">{subscription.planName}</h3>
          <p className="tnum mt-1 text-[13px] text-slate-600">
            {formatDate(subscription.startDate)} → {formatDate(subscription.endDate)} ·{' '}
            {subscription.durationLabel}
            {subscription.paymentMethod &&
              ` · ${PAYMENT_METHOD_LABELS[subscription.paymentMethod].toLowerCase()}`}
          </p>
        </div>

        {active ? (
          <div className="shrink-0 text-right">
            <p className="tnum text-3xl leading-none font-medium" style={{ color: figure }}>
              {Math.abs(subscription.daysRemaining)}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              {subscription.daysRemaining < 0
                ? 'days ago'
                : subscription.daysRemaining === 0
                  ? 'ends today'
                  : 'days left'}
            </p>
          </div>
        ) : (
          <Badge tone={SUBSCRIPTION_TONES[subscription.status]}>
            {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          </Badge>
        )}
      </div>

      {active && (
        <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-slate-300">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round(elapsedFraction(subscription) * 100)}%`,
              background: `var(--${tone})`,
            }}
          />
        </div>
      )}

      <div className="mt-4.5 flex flex-wrap items-end justify-between gap-5">
        <dl className="flex flex-wrap gap-x-7 gap-y-2">
          <div>
            <dt className="text-[11px] text-slate-500">Due</dt>
            <dd className="tnum mt-0.5 text-[15px] text-slate-900">
              {formatMoney(subscription.amountDue)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-500">Paid</dt>
            <dd className="tnum mt-0.5 text-[15px] text-slate-900">
              {formatMoney(subscription.amountPaid)}
            </dd>
          </div>
          {subscription.balance > 0 && (
            <div>
              <dt className="text-[11px] text-amber-700">Owing</dt>
              <dd className="tnum mt-0.5 text-[15px] text-amber-700">
                {formatMoney(subscription.balance)}
              </dd>
            </div>
          )}
          {subscription.discount > 0 && (
            <div>
              <dt className="text-[11px] text-slate-500">Discount</dt>
              <dd className="tnum mt-0.5 text-[15px] text-slate-900">
                {formatMoney(subscription.discount)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-[11px] text-slate-500">Payment</dt>
            <dd className="mt-0.5 text-[15px]" style={{ color: PAYMENT_COLOURS[subscription.paymentStatus] }}>
              {PAYMENT_STATUS_LABELS[subscription.paymentStatus]}
            </dd>
          </div>
        </dl>

        <div className="flex shrink-0 flex-wrap gap-2">
          {canTakePayment(subscription) && (
            <Button size="sm" onClick={onPay}>
              Take {formatMoney(subscription.balance)}
            </Button>
          )}
          {isCancellable(subscription) && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {subscription.notes && (
        <p className="sq-note sq-note-warn mt-3.5 text-xs whitespace-pre-wrap text-slate-600">
          {subscription.notes}
        </p>
      )}
    </div>
  );
}

/** A finished membership. Deliberately quiet — it is a record, not something to act on. */
function PastMembershipRow({ subscription }: { subscription: Subscription }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4.5 py-2.5 text-[13px] text-slate-600">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-slate-800">{subscription.planName}</span>
        <span className="tnum text-xs text-slate-500">
          {formatDate(subscription.startDate)} → {formatDate(subscription.endDate)}
        </span>
        <span className="text-xs" style={{ color: 'var(--bad-txt)' }}>
          {SUBSCRIPTION_STATUS_LABELS[subscription.status].toLowerCase()}
        </span>
        {subscription.balance > 0 && (
          <Badge tone="amber">{formatMoney(subscription.balance)} never collected</Badge>
        )}
      </div>
      <div className="tnum text-xs text-slate-500">
        {formatMoney(subscription.amountPaid)} paid
        {subscription.cancelledAt && (
          <>
            {' · cancelled '}
            {formatDate(subscription.cancelledAt)}
            {subscription.cancelReason && ` — ${subscription.cancelReason}`}
          </>
        )}
      </div>
    </li>
  );
}

function SellPlanDialog({
  member,
  open,
  pending,
  onClose,
  onSubmit,
}: {
  member: Member;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSubscriptionInput, onConflict: (message: string) => void) => void;
}) {
  const planQuery = usePlans();
  const sellable = useMemo(
    () => (planQuery.data ?? []).filter((plan) => plan.isActive && !plan.archivedAt),
    [planQuery.data],
  );

  const [planId, setPlanId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [conflict, setConflict] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setPlanId('');
    setStartDate('');
    setPrice('');
    setDiscount('');
    setAmountPaid('');
    setPaymentMethod('CASH');
    setNotes('');
    setConflict(undefined);
    setError(undefined);
  }, [open]);

  const plan: Plan | undefined = sellable.find((entry) => entry.id === planId);
  const listPrice = plan?.price ?? 0;
  const effectivePrice = price.trim() === '' ? listPrice : Number(price);
  const off = discount.trim() === '' ? 0 : Number(discount);
  const due = Math.max(0, effectivePrice - off);
  const paid = amountPaid.trim() === '' ? due : Number(amountPaid);
  const balance = Math.max(0, due - paid);

  function submit() {
    setError(undefined);
    if (!planId) {
      setError('Choose a plan.');
      return;
    }
    if (off < 0 || off > effectivePrice) {
      setError('The discount cannot be more than the price.');
      return;
    }
    if (paid < 0 || paid > due) {
      setError('The amount paid cannot be more than the amount due.');
      return;
    }

    const input: CreateSubscriptionInput = { planId };
    // Omit anything left at its default — the API rejects unknown or empty values.
    if (startDate) input.startDate = startDate;
    if (price.trim() !== '' && Number(price) !== listPrice) input.price = Number(price);
    if (off > 0) input.discount = off;
    if (amountPaid.trim() !== '' && paid !== due) input.amountPaid = paid;
    input.paymentMethod = paymentMethod;
    if (notes.trim()) input.notes = notes.trim();

    onSubmit(input, setConflict);
  }

  const suggestion = conflict ? suggestedStartDate(conflict) : undefined;

  return (
    <Modal
      open={open}
      title={`Sell a plan to ${member.fullName ?? 'this member'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button loading={pending} onClick={submit} disabled={sellable.length === 0}>
            {balance > 0 ? `Take ${formatMoney(paid)} now` : `Take ${formatMoney(due)}`}
          </Button>
        </>
      }
    >
      {planQuery.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-500" role="status">
          <Spinner className="size-4 text-indigo-600" />
          Loading plans…
        </div>
      ) : sellable.length === 0 ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-700 ring-1 ring-amber-200 ring-inset">
          There are no plans on sale. Add one on the Plans screen first.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <SelectField
            label="Plan"
            required
            data-autofocus
            value={planId}
            disabled={pending}
            onChange={(event) => {
              setPlanId(event.target.value);
              setPrice('');
              setDiscount('');
              setAmountPaid('');
              setConflict(undefined);
            }}
          >
            <option value="">Choose a plan…</option>
            {sellable.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} — {entry.durationLabel} — {formatMoney(entry.price)}
              </option>
            ))}
          </SelectField>

          {plan && (
            <>
              <TextField
                label="Start date"
                type="date"
                min={todayInput()}
                value={startDate}
                disabled={pending}
                hint="Leave blank to start today, or the day after their current membership ends so they lose no time."
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setConflict(undefined);
                }}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Price (₹)"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={String(listPrice)}
                  value={price}
                  disabled={pending}
                  hint={`List price ${formatMoney(listPrice)}. Override for this sale only.`}
                  onChange={(event) => setPrice(event.target.value)}
                />
                <TextField
                  label="Discount (₹)"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={discount}
                  disabled={pending}
                  onChange={(event) => setDiscount(event.target.value)}
                />
                <TextField
                  label="Amount collected now (₹)"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder={String(due)}
                  value={amountPaid}
                  disabled={pending}
                  hint="Leave blank if they're paying in full."
                  onChange={(event) => setAmountPaid(event.target.value)}
                />
                <SelectField
                  label="Payment method"
                  value={paymentMethod}
                  disabled={pending}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                >
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
                    <option key={value} value={value}>
                      {PAYMENT_METHOD_LABELS[value]}
                    </option>
                  ))}
                </SelectField>
              </div>

              <dl className="rounded-md bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-300 ring-inset">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Amount due</dt>
                  <dd className="font-medium text-slate-900">{formatMoney(due)}</dd>
                </div>
                <div className="mt-1 flex justify-between">
                  <dt className="text-slate-600">Collecting now</dt>
                  <dd className="font-medium text-slate-900">{formatMoney(paid)}</dd>
                </div>
                {balance > 0 && (
                  <div className="mt-1 flex justify-between">
                    <dt className="font-medium text-amber-700">Balance owing</dt>
                    <dd className="font-medium text-amber-700">{formatMoney(balance)}</dd>
                  </div>
                )}
              </dl>

              <TextAreaField
                label="Notes"
                rows={2}
                maxLength={1000}
                value={notes}
                disabled={pending}
                hint="Optional — e.g. what they've agreed to pay and when."
                onChange={(event) => setNotes(event.target.value)}
              />
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {conflict && (
            <div
              role="alert"
              className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-700 ring-1 ring-amber-200 ring-inset"
            >
              <p className="font-medium">{conflict}</p>
              {suggestion && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setStartDate(suggestion);
                    setConflict(undefined);
                  }}
                >
                  Start on {formatDate(suggestion)} instead
                </Button>
              )}
            </div>
          )}

          {pending && <WakingServerNotice />}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}

function PaymentDialog({
  subscription,
  pending,
  onClose,
  onSubmit,
}: {
  subscription: Subscription | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { amount: number; paymentMethod?: PaymentMethod }) => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!subscription) return;
    setAmount(String(subscription.balance));
    setMethod(subscription.paymentMethod ?? 'CASH');
    setError(undefined);
  }, [subscription]);

  function submit() {
    if (!subscription) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter the amount you have taken.');
      return;
    }
    if (value > subscription.balance) {
      setError(`That is more than the outstanding balance of ${formatMoney(subscription.balance)}.`);
      return;
    }
    setError(undefined);
    onSubmit({ amount: value, paymentMethod: method });
  }

  return (
    <Modal
      open={Boolean(subscription)}
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button loading={pending} onClick={submit}>
            Record payment
          </Button>
        </>
      }
    >
      {subscription && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-slate-600">
            <strong>{subscription.planName}</strong> · {formatMoney(subscription.amountPaid)} of{' '}
            {formatMoney(subscription.amountDue)} paid.{' '}
            <span className="font-medium text-amber-700">
              {formatMoney(subscription.balance)} owing.
            </span>
          </p>

          <TextField
            label="Amount taken (₹)"
            required
            data-autofocus
            type="number"
            min={0.01}
            max={subscription.balance}
            step="0.01"
            value={amount}
            error={error}
            disabled={pending}
            onChange={(event) => {
              setAmount(event.target.value);
              setError(undefined);
            }}
          />

          <SelectField
            label="Payment method"
            value={method}
            disabled={pending}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABELS[value]}
              </option>
            ))}
          </SelectField>

          {pending && <WakingServerNotice />}
          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      )}
    </Modal>
  );
}

function CancelDialog({
  subscription,
  pending,
  onClose,
  onSubmit,
}: {
  subscription: Subscription | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string | undefined) => void;
}) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (subscription) setReason('');
  }, [subscription]);

  return (
    <Modal
      open={Boolean(subscription)}
      title={`Cancel ${subscription?.planName ?? 'membership'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Keep it
          </Button>
          <Button variant="danger" loading={pending} onClick={() => onSubmit(reason.trim() || undefined)}>
            Cancel membership
          </Button>
        </>
      }
    >
      {subscription && (
        <>
          <p className="text-sm text-slate-600">
            <strong>{subscription.planName}</strong> runs to {formatDate(subscription.endDate)}
            {subscription.status === 'ACTIVE' && subscription.daysRemaining > 0 && (
              <> with {formatDayCount(subscription.daysRemaining)} left</>
            )}
            . Cancelling frees the dates up so you can sell a different plan.
          </p>
          {subscription.balance > 0 && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-700 ring-1 ring-amber-200 ring-inset">
              {formatMoney(subscription.balance)} is still owing on this membership. Cancelling does
              not write that off — settle it at the desk if they've paid.
            </p>
          )}
          <div className="mt-4">
            <label htmlFor="cancel-reason" className="block text-sm font-medium text-slate-700">
              Reason <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="cancel-reason"
              data-autofocus
              rows={2}
              value={reason}
              disabled={pending}
              placeholder="Switching to the 6-month plan"
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
            />
          </div>
          {pending && (
            <div className="mt-3">
              <WakingServerNotice />
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
