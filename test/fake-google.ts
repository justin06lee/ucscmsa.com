import { createVerify, generateKeyPairSync } from "node:crypto";
import type { CalendarConfig } from "@/lib/gcal";

type Stored = { body: Record<string, unknown>; status: "confirmed" | "cancelled" };

/**
 * A stand-in for Google's token endpoint and Calendar API, as far as lib/gcal
 * uses them: it checks the service account's signed assertion, and answers
 * create, update and delete the way Google does (409 for a taken id, 410 for
 * an event already deleted).
 */
export function fakeGoogle(base = "https://fake.google") {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const config: CalendarConfig = {
    calendarId: "msa-test@group.calendar.google.com",
    clientEmail: "ucscmsa-calendar@msa-test.iam.gserviceaccount.com",
    privateKey,
    tokenUrl: `${base}/token`,
    apiBase: `${base}/calendar/v3`,
  };
  const events = new Map<string, Stored>();
  const calls: string[] = [];
  let tokens = 0;
  let generated = 0;
  const state = { down: false, loseNextReply: false };

  const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  const fetchImpl = (async (input: string | URL, init: RequestInit = {}) => {
    if (state.down) throw new TypeError("fetch failed");
    const url = new URL(String(input));
    if (url.href === config.tokenUrl) {
      const assertion = new URLSearchParams(String(init.body)).get("assertion") ?? "";
      const [head, claims, sig] = assertion.split(".");
      const ok = createVerify("RSA-SHA256").update(`${head}.${claims}`).verify(publicKey, sig, "base64url");
      const c = JSON.parse(Buffer.from(claims, "base64url").toString());
      if (!ok || c.iss !== config.clientEmail || c.aud !== config.tokenUrl || !String(c.scope).includes("calendar")) {
        return json(400, { error: "invalid_grant" });
      }
      tokens++;
      return json(200, { access_token: "fake-token", expires_in: 3600 });
    }
    if ((init.headers as Record<string, string>)?.Authorization !== "Bearer fake-token") return json(401);
    const prefix = `/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`;
    if (!url.pathname.startsWith(prefix)) return json(404);
    const id = decodeURIComponent(url.pathname.slice(prefix.length).replace(/^\//, ""));
    const method = init.method ?? "GET";
    calls.push(`${method}${id ? ` ${id}` : ""}`);
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    let reply: Response;
    if (method === "POST") {
      const newId = typeof body.id === "string" ? body.id : `g${++generated}`;
      if (events.has(newId)) reply = json(409, { error: { message: "The requested identifier already exists." } });
      else {
        events.set(newId, { body: { ...body, id: newId }, status: "confirmed" });
        reply = json(200, { ...body, id: newId });
      }
    } else if (method === "PUT") {
      if (!events.has(id)) reply = json(404);
      else {
        events.set(id, { body: { ...body, id }, status: "confirmed" });
        reply = json(200, { ...body, id });
      }
    } else if (method === "DELETE") {
      const e = events.get(id);
      if (!e) reply = json(404);
      else if (e.status === "cancelled") reply = json(410);
      else {
        e.status = "cancelled";
        reply = new Response(null, { status: 204 });
      }
    } else reply = json(405);
    if (state.loseNextReply) {
      state.loseNextReply = false;
      throw new TypeError("fetch failed");
    }
    return reply;
  }) as typeof fetch;

  /** Events that are on the calendar now (not deleted). */
  const live = () =>
    [...events.entries()].filter(([, e]) => e.status === "confirmed").map(([id, e]) => ({ id, ...e.body }));

  return { config, fetch: fetchImpl, events, live, calls, state, tokenCount: () => tokens };
}
