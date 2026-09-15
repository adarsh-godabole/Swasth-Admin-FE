import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { gyms } from '../api/endpoints';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ErrorState, LoadingBlock } from '../components/states';
import { useSlowRequest } from '../hooks/useSlowRequest';

/**
 * The deep link the QR carries. The member's own camera opens it, which is why
 * there is no scanner anywhere in this product — the phone already is one.
 *
 * `swasth` is the member app's registered scheme (see the app's `app.config.ts`).
 */
const APP_SCHEME = 'swasth';

function deepLink(code: string): string {
  return `${APP_SCHEME}://check-in?code=${encodeURIComponent(code)}`;
}

/** Printed in groups so it can be read aloud and typed without losing place. */
function grouped(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const doorCodeKey = ['gym', 'door-code'] as const;

/**
 * The poster. Staff print this once and stick it by the door; members scan it
 * on the way in and check themselves in, so nobody has to press anything at
 * the desk.
 */
export function DoorCodePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmRotate, setConfirmRotate] = useState(false);

  const query = useQuery({
    queryKey: doorCodeKey,
    queryFn: gyms.doorCode,
    staleTime: 10 * 60 * 1000,
  });
  const slow = useSlowRequest(query.isLoading);

  const gymQuery = useQuery({
    queryKey: ['gym', 'current'],
    queryFn: gyms.current,
    staleTime: 10 * 60 * 1000,
  });

  const rotate = useMutation({
    mutationFn: gyms.rotateDoorCode,
    onSuccess: (next) => {
      queryClient.setQueryData(doorCodeKey, next);
      setConfirmRotate(false);
      toast.success('New code issued. Print and replace the poster on the door.');
    },
    onError: () => toast.error('Could not issue a new code.'),
  });

  const code = query.data?.code;

  return (
    <div>
      <div className="print:hidden">
        <Link to="/desk" className="text-xs text-slate-500 hover:text-slate-700">
          ← Desk
        </Link>
        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl">
            <h1 className="text-2xl font-medium text-slate-900">Door QR</h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
              Print this and put it where members walk in. Scanning it opens the Swasth app and
              records the visit — no queue at the desk.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => window.print()} disabled={!code}>
              <i className="ph ph-printer text-[14px]" aria-hidden="true" />
              Print poster
            </Button>
            <Button variant="secondary" onClick={() => setConfirmRotate(true)} disabled={!code}>
              New code
            </Button>
          </div>
        </div>
      </div>

      {query.isLoading ? (
        <div className="mt-5 rounded-md bg-white shadow-[var(--shadow-sm)]">
          <LoadingBlock label="Loading the door code…" slow={slow} />
        </div>
      ) : query.isError ? (
        <div className="mt-5 rounded-md bg-white shadow-[var(--shadow-sm)]">
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </div>
      ) : code ? (
        <>
          <Poster code={code} gymName={gymQuery.data?.name ?? 'Swasth'} />

          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-slate-500 print:hidden">
            The code is the same every day, so a member who saves the image can check in without
            being here. That matches the in-app button, which has always been self-reported — if a
            poster turns up somewhere it shouldn't, issue a new code and the old one stops working.
          </p>
        </>
      ) : null}

      <Modal
        open={confirmRotate}
        title="Issue a new door code?"
        onClose={() => setConfirmRotate(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRotate(false)}>
              Keep the current one
            </Button>
            <Button variant="danger" loading={rotate.isPending} onClick={() => rotate.mutate()}>
              Issue new code
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Every printed copy of the current code stops working the moment you do this. Members
          scanning an old poster will be told to ask at the desk.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Only worth doing if the code has spread somewhere it shouldn't have.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Sized for a sheet of A4 on the wall: the QR large enough to scan from arm's
 * length, and the code spelled out beneath it for anyone whose camera refuses
 * to follow a custom scheme.
 */
function Poster({ code, gymName }: { code: string; gymName: string }) {
  return (
    <section className="print-poster mt-5 rounded-md bg-white p-8 shadow-[var(--shadow-sm)] print:mt-0 print:p-0 print:shadow-none">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 text-center">
        <div>
          <p className="sq-lbl">{gymName}</p>
          <h2 className="mt-2 text-3xl font-medium text-slate-900">Scan to check in</h2>
          <p className="mt-2 text-sm text-slate-600">
            Point your phone camera at the code. The Swasth app records your visit.
          </p>
        </div>

        <QrImage value={deepLink(code)} />

        <div>
          <p className="sq-lbl">Camera not working?</p>
          <p className="tnum mt-1.5 text-2xl tracking-[0.2em] text-slate-900">{grouped(code)}</p>
          <p className="mt-1.5 text-xs text-slate-500">
            Open the Swasth app, tap Enter gym code, and type this.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Rendered to an SVG string rather than a canvas so it stays sharp at whatever
 * size the printer decides on. The QR is drawn on a white tile regardless of
 * theme — a dark-on-dark code does not scan.
 */
function QrImage({ value }: { value: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    QRCode.toString(value, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((markup) => {
        if (live.current) setSvg(markup);
      })
      .catch(() => {
        if (live.current) setFailed(true);
      });
    return () => {
      live.current = false;
    };
  }, [value]);

  if (failed) {
    return (
      <p className="text-[13px] text-red-700" role="alert">
        The QR image could not be drawn. The code below still works.
      </p>
    );
  }

  // A real white tile, not the theme's `white` token: the code needs a light
  // quiet zone around it or scanners struggle at the edges.
  const tile = 'size-64 rounded-md p-3 [&>svg]:size-full';

  if (!svg) return <div className={tile} style={{ background: '#fff' }} aria-hidden="true" />;

  return (
    <div
      className={tile}
      style={{ background: '#fff' }}
      // The library returns a self-contained SVG built from the value above —
      // no user input reaches this markup.
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="Check-in QR code"
      role="img"
    />
  );
}
