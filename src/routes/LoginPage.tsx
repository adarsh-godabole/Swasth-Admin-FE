import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { auth, gyms } from '../api/endpoints';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { Spinner } from '../components/Spinner';
import { WakingServerNotice, errorDetails, errorMessage } from '../components/states';
import { useCountdown } from '../hooks/useCountdown';
import { useSlowRequest } from '../hooks/useSlowRequest';
import { isValidPhone, normalisePhone } from '../lib/format';

const RESEND_COOLDOWN_SECONDS = 60;

/** The backend's cooldown message carries the exact wait: "Please wait 42 second(s)…". */
function parseCooldownSeconds(message: string): number | null {
  const match = /(\d+)\s*second/i.exec(message);
  return match ? Number(match[1]) : null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneError, setPhoneError] = useState<string>();
  const [formError, setFormError] = useState<{ message: string; details?: string[] }>();
  const [devCode, setDevCode] = useState<string>();
  const [maskedPhone, setMaskedPhone] = useState<string>();

  const cooldown = useCountdown();
  const codeInput = useRef<HTMLInputElement>(null);

  // No auth needed, so staff can see which gym they're logging into.
  const gymQuery = useQuery({ queryKey: ['gym', 'current'], queryFn: gyms.current });

  const sendOtp = useMutation({
    mutationFn: (value: string) => auth.sendOtp(value),
    onSuccess: (data) => {
      setFormError(undefined);
      setDevCode(data.devCode);
      setMaskedPhone(data.phone);
      setStep('code');
      cooldown.start(RESEND_COOLDOWN_SECONDS);
    },
    onError: (error) => {
      // A cooldown rejection is not a failure to send: the earlier code still works.
      if (error instanceof ApiError && error.statusCode === 400) {
        const seconds = parseCooldownSeconds(error.message);
        if (seconds !== null) {
          cooldown.start(seconds);
          setStep('code');
          setFormError({
            message: `${error.message} The code we already sent you is still valid.`,
          });
          return;
        }
      }
      setFormError({ message: errorMessage(error), details: errorDetails(error) });
    },
  });

  const verifyOtp = useMutation({
    mutationFn: (values: { phone: string; code: string }) =>
      auth.verifyOtp(values.phone, values.code),
    onSuccess: (result) => {
      signIn(result);
      navigate('/desk', { replace: true });
    },
    onError: (error) => {
      setFormError({ message: errorMessage(error), details: errorDetails(error) });
      setCode('');
      codeInput.current?.focus();
    },
  });

  const busy = sendOtp.isPending || verifyOtp.isPending;
  const slow = useSlowRequest(busy || gymQuery.isLoading);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  function submitPhone() {
    const value = normalisePhone(phone);
    if (!isValidPhone(value)) {
      setPhoneError('Enter a 10-digit Indian mobile number, or a number starting with +.');
      return;
    }
    setPhoneError(undefined);
    setPhone(value);
    sendOtp.mutate(value);
  }

  function submitCode() {
    if (code.length !== 6) {
      setFormError({ message: 'Enter the 6-digit code.' });
      return;
    }
    verifyOtp.mutate({ phone, code });
  }

  function changeNumber() {
    setStep('phone');
    setCode('');
    setFormError(undefined);
    setDevCode(undefined);
  }

  const gym = gymQuery.data;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex items-center gap-3">
          {gym?.logoUrl ? (
            <img src={gym.logoUrl} alt="" className="size-10 rounded-md object-cover" />
          ) : (
            <div
              className="flex size-10 items-center justify-center rounded-md text-lg text-indigo-700"
              style={{ boxShadow: 'inset 0 0 0 1px var(--color-accent-700)' }}
            >
              S
            </div>
          )}
          <div className="min-w-0">
            {gymQuery.isLoading ? (
              <Spinner className="size-4 text-slate-400" />
            ) : (
              <p className="text-[15px] font-medium text-slate-900">
                {gym?.name ?? 'Swasth Admin'}
              </p>
            )}
            <p className="mt-0.5 text-xs text-slate-500">
              {gym?.city ? `${gym.city}${gym.state ? `, ${gym.state}` : ''} · ` : ''}staff portal
            </p>
          </div>
        </div>

        <div>
          {step === 'phone' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitPhone();
              }}
              className="space-y-4"
            >
              <h1 className="text-2xl font-medium text-slate-900">Sign in</h1>
              <p className="!mt-1.5 text-[13px] text-slate-600">
                Staff only. We'll text a 6-digit code to your registered number.
              </p>
              <TextField
                label="Mobile number"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                value={phone}
                error={phoneError}
                hint="We'll text you a 6-digit code."
                onChange={(event) => setPhone(event.target.value)}
                disabled={sendOtp.isPending}
              />
              {formError && <FormError {...formError} />}
              <Button type="submit" loading={sendOtp.isPending} className="w-full">
                Send code
              </Button>
              {slow && sendOtp.isPending && <WakingServerNotice />}
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitCode();
              }}
              className="space-y-4"
            >
              <div>
                <h1 className="text-2xl font-medium text-slate-900">Enter the code</h1>
                <p className="mt-1.5 text-[13px] text-slate-600">
                  Sent to <span className="tnum text-slate-800">{maskedPhone}</span> ·{' '}
                  <button
                    type="button"
                    onClick={changeNumber}
                    className="text-indigo-700 hover:underline"
                  >
                    use another number
                  </button>
                </p>
              </div>

              <TextField
                label="6-digit code"
                required
                ref={codeInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                className="tnum block h-13 w-full rounded-md bg-white px-3 text-center text-xl tracking-[0.45em] text-slate-900 ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                  setFormError(undefined);
                }}
                disabled={verifyOtp.isPending}
              />

              {devCode && (
                <p className="sq-note sq-note-accent text-xs text-slate-600">
                  Development code <span className="tnum text-indigo-800">{devCode}</span>
                </p>
              )}

              {formError && <FormError {...formError} />}

              <Button
                type="submit"
                loading={verifyOtp.isPending}
                disabled={code.length !== 6}
                className="w-full"
              >
                Verify and sign in
              </Button>
              {slow && verifyOtp.isPending && <WakingServerNotice />}

              <p className="text-center text-xs text-slate-500">
                {cooldown.remaining > 0 ? (
                  <span className="tnum">Resend in {cooldown.remaining}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendOtp.mutate(phone)}
                    disabled={sendOtp.isPending}
                    className="text-indigo-700 hover:underline disabled:text-slate-500 disabled:no-underline"
                  >
                    {sendOtp.isPending ? 'Sending…' : 'Resend code'}
                  </button>
                )}{' '}
                · the code lasts 5 minutes and allows 5 attempts
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function FormError({ message, details }: { message: string; details?: string[] }) {
  return (
    <div
      role="alert"
      className="sq-note sq-note-bad"
    >
      <p className="text-[13px] text-red-700">{message}</p>
      {details && details.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-slate-500">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
