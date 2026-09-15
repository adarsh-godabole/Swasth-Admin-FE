import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';

/**
 * Real user monitoring for the portal, reported to Grafana Cloud via Faro.
 *
 * What this buys over the backend's telemetry: the desk runs this in a browser
 * on a machine nobody administers. A JS error, a slow render, or a build that
 * only breaks on the gym's old laptop is invisible server-side — the API sees a
 * perfectly healthy 200 and the member still waits at the counter.
 *
 * ## Off unless configured
 *
 * With no collector URL this does nothing, so local development and CI stay
 * silent and a missing env var can never break the app. Same contract as the
 * API's OTLP exporters.
 *
 * ## Why not the React Native app too
 *
 * Grafana's React Native Faro SDK is an experimental port, and Grafana's own
 * position is that React Native is not officially supported. The web SDK here
 * is a supported, versioned release; shipping the experimental one into the app
 * members actually run is a different risk, and is deliberately not done.
 */
export function startTelemetry(): boolean {
  const url = import.meta.env?.VITE_FARO_URL?.trim();
  if (!url) return false;

  try {
    initializeFaro({
      url,
      app: {
        name: 'swasth-admin',
        version: import.meta.env?.VITE_APP_VERSION ?? 'dev',
        environment: import.meta.env?.MODE ?? 'development',
      },
      instrumentations: [
        // Errors, unhandled rejections, web vitals, console and route changes.
        ...getWebInstrumentations(),
      ],
      // The staff phone number is the login identifier and appears in URLs and
      // search boxes all over this app. Nothing here should carry it to a
      // third party, so the session is anonymous by default — if you later
      // need to tie an error to a person, set a gym user id, never a phone.
      sessionTracking: { enabled: true, persistent: false },
    });
    return true;
  } catch {
    // Monitoring must never be the reason the portal fails to start.
    return false;
  }
}
