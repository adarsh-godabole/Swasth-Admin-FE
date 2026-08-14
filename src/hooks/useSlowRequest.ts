import { useEffect, useState } from 'react';

/**
 * True once a request has been pending for `delay` ms. The backend is on a free
 * Render tier and sleeps after 15 minutes idle, so the first call of the day can
 * take 30–60 seconds — that needs explaining rather than a spinner that looks stuck.
 */
export function useSlowRequest(pending: boolean, delay = 5000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), delay);
    return () => window.clearTimeout(timer);
  }, [pending, delay]);

  return slow;
}
