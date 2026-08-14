import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Seconds remaining on a cooldown. Used for the 60-second OTP resend window —
 * asking again too soon returns a 400 and the *original* code stays valid, which
 * is the single easiest way to make staff think the portal is broken.
 */
export function useCountdown(): {
  remaining: number;
  start: (seconds: number) => void;
  clear: () => void;
} {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (deadline === null) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && timer.current !== null) {
        window.clearInterval(timer.current);
        timer.current = null;
      }
    };
    tick();
    timer.current = window.setInterval(tick, 500);
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
    };
  }, [deadline]);

  const start = useCallback((seconds: number) => {
    setDeadline(Date.now() + seconds * 1000);
  }, []);

  const clear = useCallback(() => setDeadline(null), []);

  return { remaining, start, clear };
}
