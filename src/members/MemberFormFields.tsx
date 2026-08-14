import { SelectField, TextAreaField, TextField } from '../components/Field';
import { ACTIVITY_LABELS, GENDER_LABELS, GOAL_LABELS } from '../api/types';
import type { ActivityLevel, FitnessGoal, Gender } from '../api/types';
import type { MemberFormErrors, MemberFormValues } from './form';

interface Props {
  values: MemberFormValues;
  errors: MemberFormErrors;
  disabled?: boolean;
  onChange: <K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) => void;
}

/** The optional half of the member form, shared by register and edit. */
export function MemberDetailsFields({ values, errors, disabled, onChange }: Props) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Personal</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            maxLength={255}
            value={values.email}
            error={errors.email}
            disabled={disabled}
            onChange={(event) => onChange('email', event.target.value)}
          />
          <SelectField
            label="Gender"
            value={values.gender}
            error={errors.gender}
            disabled={disabled}
            onChange={(event) => onChange('gender', event.target.value as Gender | '')}
          >
            <option value="">Not specified</option>
            {(Object.keys(GENDER_LABELS) as Gender[]).map((value) => (
              <option key={value} value={value}>
                {GENDER_LABELS[value]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Date of birth"
            type="date"
            value={values.dateOfBirth}
            error={errors.dateOfBirth}
            disabled={disabled}
            onChange={(event) => onChange('dateOfBirth', event.target.value)}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Fitness</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Height (cm)"
            type="number"
            inputMode="decimal"
            min={50}
            max={280}
            step="0.01"
            value={values.heightCm}
            error={errors.heightCm}
            hint="50–280, up to 2 decimals"
            disabled={disabled}
            onChange={(event) => onChange('heightCm', event.target.value)}
          />
          <TextField
            label="Weight (kg)"
            type="number"
            inputMode="decimal"
            min={20}
            max={500}
            step="0.01"
            value={values.weightKg}
            error={errors.weightKg}
            hint="20–500, up to 2 decimals"
            disabled={disabled}
            onChange={(event) => onChange('weightKg', event.target.value)}
          />
          <SelectField
            label="Goal"
            value={values.goal}
            disabled={disabled}
            onChange={(event) => onChange('goal', event.target.value as FitnessGoal | '')}
          >
            <option value="">Not specified</option>
            {(Object.keys(GOAL_LABELS) as FitnessGoal[]).map((value) => (
              <option key={value} value={value}>
                {GOAL_LABELS[value]}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Activity level"
            value={values.activityLevel}
            disabled={disabled}
            onChange={(event) =>
              onChange('activityLevel', event.target.value as ActivityLevel | '')
            }
          >
            <option value="">Not specified</option>
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((value) => (
              <option key={value} value={value}>
                {ACTIVITY_LABELS[value]}
              </option>
            ))}
          </SelectField>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Safety</h3>
        <p className="mb-3 text-xs text-slate-500">
          Shown prominently on the member's record — trainers rely on it on the floor.
        </p>
        <div className="space-y-4">
          <TextAreaField
            label="Medical notes"
            maxLength={1000}
            value={values.medicalNotes}
            error={errors.medicalNotes}
            hint={`${values.medicalNotes.length}/1000 — injuries, conditions, movements to avoid`}
            disabled={disabled}
            onChange={(event) => onChange('medicalNotes', event.target.value)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Emergency contact name"
              maxLength={120}
              value={values.emergencyContactName}
              error={errors.emergencyContactName}
              disabled={disabled}
              onChange={(event) => onChange('emergencyContactName', event.target.value)}
            />
            <TextField
              label="Emergency contact phone"
              type="tel"
              inputMode="tel"
              maxLength={20}
              value={values.emergencyContactPhone}
              error={errors.emergencyContactPhone}
              disabled={disabled}
              onChange={(event) => onChange('emergencyContactPhone', event.target.value)}
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Front-desk notes</h3>
        <TextAreaField
          label="Notes"
          maxLength={1000}
          value={values.notes}
          error={errors.notes}
          hint={`${values.notes.length}/1000 — internal, not shown to the member`}
          disabled={disabled}
          onChange={(event) => onChange('notes', event.target.value)}
        />
      </section>
    </div>
  );
}
