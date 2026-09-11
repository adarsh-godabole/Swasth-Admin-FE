import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { SelectField, TextAreaField, TextField } from '../components/Field';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { EmptyState, ErrorState, LoadingBlock, WakingServerNotice } from '../components/states';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { formatMoney } from '../lib/format';
import { useArchivePlan, useCreatePlan, usePlans, useUpdatePlan } from '../members/planQueries';
import { usePlanSales } from '../members/insightQueries';
import type { CreatePlanInput, DurationUnit, Plan } from '../api/types';

interface PlanFormValues {
  name: string;
  description: string;
  durationValue: string;
  durationUnit: DurationUnit;
  price: string;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: string;
}

const EMPTY_PLAN: PlanFormValues = {
  name: '',
  description: '',
  durationValue: '1',
  durationUnit: 'MONTH',
  price: '',
  isActive: true,
  isPublic: true,
  sortOrder: '',
};

type PlanErrors = Partial<Record<keyof PlanFormValues, string>>;

/** Mirrors the API's constraints so a typo doesn't cost a round trip. */
function validatePlan(values: PlanFormValues): PlanErrors {
  const errors: PlanErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length > 120) errors.name = 'Name must be 120 characters or fewer.';

  const duration = Number(values.durationValue);
  if (!values.durationValue.trim()) errors.durationValue = 'Duration is required.';
  else if (!Number.isInteger(duration)) errors.durationValue = 'Duration must be a whole number.';
  else if (duration < 1 || duration > 120) errors.durationValue = 'Duration must be between 1 and 120.';

  const price = Number(values.price);
  if (!values.price.trim()) errors.price = 'Price is required.';
  else if (!Number.isFinite(price)) errors.price = 'Price must be a number.';
  else if (price < 0 || price > 10_000_000) errors.price = 'Price must be between 0 and 1,00,00,000.';

  if (values.sortOrder.trim() && !Number.isInteger(Number(values.sortOrder))) {
    errors.sortOrder = 'Display order must be a whole number.';
  }

  return errors;
}

function toPlanPayload(values: PlanFormValues): CreatePlanInput {
  const payload: CreatePlanInput = {
    name: values.name.trim(),
    durationValue: Number(values.durationValue),
    durationUnit: values.durationUnit,
    price: Number(values.price),
    isActive: values.isActive,
    isPublic: values.isPublic,
  };
  if (values.description.trim()) payload.description = values.description.trim();
  if (values.sortOrder.trim()) payload.sortOrder = Number(values.sortOrder);
  return payload;
}

function fromPlan(plan: Plan): PlanFormValues {
  return {
    name: plan.name,
    description: plan.description ?? '',
    durationValue: String(plan.durationValue),
    durationUnit: plan.durationUnit,
    price: String(plan.price),
    isActive: plan.isActive,
    isPublic: plan.isPublic,
    sortOrder: String(plan.sortOrder),
  };
}

export function PlansPage() {
  const toast = useToast();
  const query = usePlans();
  const slow = useSlowRequest(query.isLoading);

  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Plan | null>(null);

  const create = useCreatePlan();
  const update = useUpdatePlan();
  const archive = useArchivePlan();

  const all = query.data ?? [];
  const sales = usePlanSales();
  const sold = new Map<string, number>(
    sales.plans.flatMap((plan) =>
      plan.timesSold === undefined ? [] : [[plan.id, plan.timesSold] as const],
    ),
  );

  const onSale = all.filter((plan) => !plan.archivedAt);
  const archived = all.filter((plan) => plan.archivedAt);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-xl">
          <h1 className="text-2xl font-medium text-slate-900">Plans</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Editing a plan never rewrites memberships already sold — name, price and duration are
            copied onto each sale.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <i className="ph ph-plus text-[14px]" aria-hidden="true" />
          New plan
        </Button>
      </div>

      <div className="mt-4.5 overflow-hidden rounded-md bg-white shadow-[var(--shadow-sm)]">
        {query.isLoading ? (
          <LoadingBlock label="Loading plans…" slow={slow} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
        ) : all.length === 0 ? (
          <EmptyState
            title="No plans yet"
            description="Add the plans the desk sells — a monthly, a quarterly, whatever the gym offers. You need at least one before you can sell a membership."
            action={<Button onClick={() => setEditing('new')}>New plan</Button>}
          />
        ) : (
          <>
            <PlanTable
              plans={onSale}
              sold={sold}
              onEdit={setEditing}
              onArchive={setArchiving}
              pending={archive.isPending}
            />
            {archived.length > 0 && (
              <>
                <p className="sq-lbl border-t border-slate-200 bg-slate-200 px-3.5 py-2.5">
                  Archived — not on sale, history kept
                </p>
                <PlanTable
                  plans={archived}
                  sold={sold}
                  head={false}
                  onEdit={setEditing}
                  onArchive={setArchiving}
                  pending={archive.isPending}
                />
              </>
            )}
          </>
        )}
      </div>

      <p className="mt-3.5 text-xs text-slate-500">
        Restoring a plan puts it back on sale at the desk but not in the member app — the app flag
        has to be re-ticked.
      </p>

      <PlanDialog
        plan={editing}
        pending={create.isPending || update.isPending}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          const payload = toPlanPayload(values);
          const done = {
            onSuccess: () => {
              toast.success(editing === 'new' ? 'Plan created.' : 'Plan updated.');
              setEditing(null);
            },
            onError: (error: unknown) => {
              if (error instanceof ApiError) toast.error(error.message, error.errors);
              else toast.error('Could not save the plan.');
            },
          };
          if (editing === 'new') create.mutate(payload, done);
          else if (editing) update.mutate({ id: editing.id, input: payload }, done);
        }}
      />

      <Modal
        open={Boolean(archiving)}
        title={archiving?.archivedAt ? `Put ${archiving.name} back on sale` : `Archive ${archiving?.name ?? ''}`}
        onClose={() => setArchiving(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiving(null)} disabled={archive.isPending}>
              Cancel
            </Button>
            <Button
              variant={archiving?.archivedAt ? 'primary' : 'danger'}
              loading={archive.isPending}
              data-autofocus
              onClick={() => {
                if (!archiving) return;
                archive.mutate(
                  { id: archiving.id, archived: Boolean(archiving.archivedAt) },
                  {
                    onSuccess: () => {
                      toast.success(
                        archiving.archivedAt
                          ? `${archiving.name} is on sale again.`
                          : `${archiving.name} is archived.`,
                      );
                      setArchiving(null);
                    },
                    onError: (error) => {
                      if (error instanceof ApiError) toast.error(error.message, error.errors);
                      else toast.error('Could not change the plan.');
                    },
                  },
                );
              }}
            >
              {archiving?.archivedAt ? 'Put back on sale' : 'Archive plan'}
            </Button>
          </>
        }
      >
        {archiving?.archivedAt ? (
          <>
            <p className="text-sm text-slate-600">
              <strong>{archiving.name}</strong> will be sellable at the desk again.
            </p>
            {/* Archiving clears isPublic and restoring does not put it back. */}
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ring-inset">
              Archiving also hid this plan from the member app, and restoring doesn't undo that.
              Edit the plan afterwards and tick <strong>Visible in the member app</strong> if members
              should see it again.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            <strong>{archiving?.name}</strong> will no longer be sellable at the desk.
            Memberships already sold on it keep running, and you can put it back on sale at any
            time. Plans are never deleted.
          </p>
        )}
        {archive.isPending && (
          <div className="mt-3">
            <WakingServerNotice />
          </div>
        )}
      </Modal>
    </div>
  );
}

function PlanTable({
  plans,
  sold,
  onEdit,
  onArchive,
  pending,
  head = true,
}: {
  plans: Plan[];
  /** `timesSold` by plan id — only `GET /plans/:id` carries it. */
  sold: Map<string, number>;
  onEdit: (plan: Plan) => void;
  onArchive: (plan: Plan) => void;
  pending: boolean;
  head?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        {head && (
          <thead>
            <tr className="bg-slate-200">
              <th scope="col" className="sq-th">
                Plan
              </th>
              <th scope="col" className="sq-th">
                Duration
              </th>
              <th scope="col" className="sq-th">
                Price
              </th>
              <th scope="col" className="sq-th">
                Sold
              </th>
              <th scope="col" className="sq-th">
                Reach
              </th>
              <th scope="col" className="sq-th">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {plans.map((plan) => {
            // Archived rows stay in the table but step back a level.
            const dim = plan.archivedAt ? 'opacity-70' : '';
            return (
              <tr key={plan.id} className="hover:bg-slate-100">
                <td className={`sq-cell ${dim} ${head ? '' : 'border-t-0'}`}>
                  <p className="text-slate-900">{plan.name}</p>
                  {plan.description && (
                    <p className="mt-0.5 text-[11px] text-slate-500">{plan.description}</p>
                  )}
                </td>
                <td className={`sq-cell tnum whitespace-nowrap ${dim} ${head ? '' : 'border-t-0'}`}>
                  {plan.durationLabel}
                </td>
                <td
                  className={`sq-cell tnum whitespace-nowrap text-slate-900 ${dim} ${head ? '' : 'border-t-0'}`}
                >
                  {formatMoney(plan.price)}
                </td>
                <td className={`sq-cell tnum ${dim} ${head ? '' : 'border-t-0'}`}>
                  {sold.get(plan.id) ?? '—'}
                </td>
                <td className={`sq-cell ${dim} ${head ? '' : 'border-t-0'}`}>
                  <PlanReach plan={plan} />
                </td>
                <td className={`sq-cell text-right ${head ? '' : 'border-t-0'}`}>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(plan)}
                      disabled={pending}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onArchive(plan)}
                      disabled={pending}
                    >
                      {plan.archivedAt ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Where a plan can actually be bought, as one phrase rather than two badges. */
function PlanReach({ plan }: { plan: Plan }) {
  if (plan.archivedAt) return <span className="text-slate-500">Archived</span>;
  if (!plan.isActive) return <Badge tone="slate">Off sale</Badge>;
  return <Badge tone="green">{plan.isPublic ? 'Desk · app' : 'Desk only'}</Badge>;
}

function PlanDialog({
  plan,
  pending,
  onClose,
  onSubmit,
}: {
  plan: Plan | 'new' | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: PlanFormValues) => void;
}) {
  const [values, setValues] = useState<PlanFormValues>(EMPTY_PLAN);
  const [errors, setErrors] = useState<PlanErrors>({});

  useEffect(() => {
    if (!plan) return;
    setValues(plan === 'new' ? EMPTY_PLAN : fromPlan(plan));
    setErrors({});
  }, [plan]);

  function change<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function submit() {
    const found = validatePlan(values);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(values);
  }

  return (
    <Modal
      open={Boolean(plan)}
      title={plan === 'new' ? 'New plan' : `Edit ${plan?.name ?? 'plan'}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button loading={pending} onClick={submit}>
            {plan === 'new' ? 'Create plan' : 'Save plan'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <TextField
          label="Name"
          required
          data-autofocus
          maxLength={120}
          placeholder="3 Months"
          value={values.name}
          error={errors.name}
          disabled={pending}
          onChange={(event) => change('name', event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Duration"
            required
            type="number"
            min={1}
            max={120}
            step={1}
            value={values.durationValue}
            error={errors.durationValue}
            disabled={pending}
            onChange={(event) => change('durationValue', event.target.value)}
          />
          <SelectField
            label="Unit"
            value={values.durationUnit}
            disabled={pending}
            onChange={(event) => change('durationUnit', event.target.value as DurationUnit)}
          >
            <option value="MONTH">Months</option>
            <option value="DAY">Days</option>
          </SelectField>
          <TextField
            label="Price (₹)"
            required
            type="number"
            min={0}
            step="0.01"
            placeholder="4500"
            value={values.price}
            error={errors.price}
            disabled={pending}
            onChange={(event) => change('price', event.target.value)}
          />
        </div>

        <TextAreaField
          label="Description"
          rows={2}
          value={values.description}
          disabled={pending}
          hint="Optional. Shown to members in the app."
          onChange={(event) => change('description', event.target.value)}
        />

        <TextField
          label="Display order"
          type="number"
          step={1}
          value={values.sortOrder}
          error={errors.sortOrder}
          hint="Optional. Lower numbers appear first."
          disabled={pending}
          onChange={(event) => change('sortOrder', event.target.value)}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Availability</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={values.isActive}
              disabled={pending}
              onChange={(event) => change('isActive', event.target.checked)}
            />
            <span>
              <span className="font-medium text-slate-800">On sale at the desk</span>
              <span className="block text-xs text-slate-500">
                Staff can sell it. Turn this off to stop selling without archiving.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={values.isPublic}
              disabled={pending}
              onChange={(event) => change('isPublic', event.target.checked)}
            />
            <span>
              <span className="font-medium text-slate-800">Visible in the member app</span>
              <span className="block text-xs text-slate-500">
                Members browsing the app can see this plan and its price.
              </span>
            </span>
          </label>
        </fieldset>

        {pending && <WakingServerNotice />}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
