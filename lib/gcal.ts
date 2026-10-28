// Writes timelines to the MSA's shared Google Calendar as all-day events,
// signed in as a Google service account (GOOGLE_SA_JSON) that the calendar's
// owner has shared the calendar with ("Make changes to events"). Without
// GOOGLE_SA_JSON and GOOGLE_CALENDAR_ID it is off.

import { createSign } from "node:crypto";
import { addDaysYmd } from "@/lib/planning";

export type CalendarConfig = {
  calendarId: string;
  clientEmail: string;
  privateKey: string;
  tokenUrl: string;
  apiBase: string;
};

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/calendar/v3";

export class CalendarError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** GOOGLE_SA_JSON is the service account's key file, as JSON or base64 of it. */
export function calendarConfigFromEnv(env: Record<string, string | undefined> = process.env): CalendarConfig | null {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  const raw = env.GOOGLE_SA_JSON?.trim();
  if (!calendarId || !raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as { client_email?: string; private_key?: string; token_uri?: string };
    if (!sa.client_email || !sa.private_key) return null;
    return {
      calendarId,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
      tokenUrl: sa.token_uri || TOKEN_URL,
      // Only for tests against a stand-in Google (scripts/fake-google-server.ts).
      apiBase: env.GOOGLE_CALENDAR_API_BASE?.trim() || API_BASE,
    };
  } catch {
    return null;
  }
}

const tokens = new Map<string, { token: string; expires: number }>();

export function resetCalendarTokens() {
  tokens.clear();
}

async function accessToken(cfg: CalendarConfig, fetchImpl: typeof fetch): Promise<string> {
  const key = `${cfg.clientEmail}|${cfg.tokenUrl}`;
  const cached = tokens.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({
    iss: cfg.clientEmail,
    scope: SCOPE,
    aud: cfg.tokenUrl,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(cfg.privateKey, "base64url");
  const res = await fetchImpl(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new CalendarError(`Google sign-in failed: ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  tokens.set(key, { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function call(cfg: CalendarConfig, fetchImpl: typeof fetch, method: string, path: string, body?: object) {
  const token = await accessToken(cfg, fetchImpl);
  return fetchImpl(`${cfg.apiBase}/calendars/${encodeURIComponent(cfg.calendarId)}/events${path}?sendUpdates=none`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * The event id a timeline asks Google for, so creating it twice finds the
 * first one instead of making a duplicate. Google ids use 0-9 and a-v.
 */
export function eventIdFor(timelineId: string): string {
  return `msa${Buffer.from(timelineId).toString("hex")}`;
}

export type CalendarTimeline = { id: string; title: string; eventDate: string; googleEventId: string | null };

function eventBody(t: CalendarTimeline) {
  return {
    summary: t.title,
    start: { date: t.eventDate },
    end: { date: addDaysYmd(t.eventDate, 1) },
    transparency: "transparent",
    status: "confirmed",
    extendedProperties: { private: { ucscmsaTimeline: t.id } },
  };
}

async function fail(res: Response, what: string): Promise<never> {
  throw new CalendarError(`${what}: ${res.status} ${(await res.text()).slice(0, 200)}`, res.status);
}

/** Create or update the timeline's event; returns the Google event id to store. */
export async function putCalendarEvent(cfg: CalendarConfig, t: CalendarTimeline, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = eventBody(t);
  if (t.googleEventId) {
    const res = await call(cfg, fetchImpl, "PUT", `/${encodeURIComponent(t.googleEventId)}`, body);
    if (res.ok) return t.googleEventId;
    if (res.status !== 404 && res.status !== 410) await fail(res, "Calendar update failed");
  }
  const id = eventIdFor(t.id);
  const made = await call(cfg, fetchImpl, "POST", "", { id, ...body });
  if (made.ok) return id;
  if (made.status !== 409) await fail(made, "Calendar create failed");
  // That id exists already, perhaps deleted earlier: bring it back with the new details.
  const back = await call(cfg, fetchImpl, "PUT", `/${id}`, body);
  if (back.ok) return id;
  // Google won't reuse it, so let Google pick a fresh id.
  const fresh = await call(cfg, fetchImpl, "POST", "", body);
  if (!fresh.ok) await fail(fresh, "Calendar create failed");
  return ((await fresh.json()) as { id: string }).id;
}

/** Remove the event; one that's already gone counts as removed. */
export async function deleteCalendarEvent(cfg: CalendarConfig, googleEventId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await call(cfg, fetchImpl, "DELETE", `/${encodeURIComponent(googleEventId)}`);
  if (res.ok || res.status === 404 || res.status === 410) return;
  await fail(res, "Calendar delete failed");
}
