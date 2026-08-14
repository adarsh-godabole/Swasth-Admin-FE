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
      navigate('/members', { replace: true });
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
        <div className="mb-6 flex flex-col items-center text-center">
          {gym?.logoUrl ? (
            <img src={gym.logoUrl} alt="" className="mb-3 size-14 rounded-lg object-cover" />
          ) : (
            <div className="mb-3 flex size-14 items-center justify-center rounded-lg bg-indigo-600 text-xl font-bold text-white">
              S
            </div>
          )}
          {gymQuery.isLoading ? (
            <Spinner className="size-4 text-slate-400" />
          ) : (
            <h1 className="text-lg font-semibold text-slate-900">{gym?.name ?? 'Swasth Admin'}</h1>
          )}
          {gym?.city && (
            <p className="text-sm text-slate-500">
              {gym.city}
              {gym.state ? `, ${gym.state}` : ''}
            </p>
          )}
          <p className="mt-1 text-xs font-medium tracking-wide text-slate-400 uppercase">
            Staff portal
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {step === 'phone' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitPhone();
              }}
              className="space-y-4"
            >
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
                <p className="text-sm text-slate-600">
                  Code sent to <span className="font-medium text-slate-900">{maskedPhone}</span>
                </p>
                <button
                  type="button"
                  onClick={changeNumber}
                  className="mt-0.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Use a different number
                </button>
              </div>

              <TextField
                label="6-digit code"
                required
                ref={codeInput}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                className="block w-full rounded-md bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-slate-900 ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-indigo-600"
                onChange={(event) => {
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                  setFormError(undefined);
                }}
                disabled={verifyOtp.isPending}
              />

              {devCode && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 ring-inset">
                  Development code: <span className="font-mono font-semibold">{devCode}</span>
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

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => sendOtp.mutate(phone)}
                  disabled={cooldown.remaining > 0 || sendOtp.isPending}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  {cooldown.remaining > 0
                    ? `Resend code in ${cooldown.remaining}s`
                    : sendOtp.isPending
                      ? 'Sending…'
                      : 'Resend code'}
                </button>
                <p className="mt-1 text-xs text-slate-400">
                  The code expires in 5 minutes and allows 5 attempts.
                </p>
              </div>
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
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200 ring-inset"
    >
      <p>{message}</p>
      {details && details.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
