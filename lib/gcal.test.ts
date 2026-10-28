import { beforeEach, describe, expect, it } from "vitest";
import { fakeGoogle } from "@/test/fake-google";
import {
  CalendarError,
  calendarConfigFromEnv,
  deleteCalendarEvent,
  eventIdFor,
  putCalendarEvent,
  resetCalendarTokens,
} from "@/lib/gcal";

beforeEach(() => resetCalendarTokens());

const timeline = { id: "6f1c2a4e-0b7d-4c55-9e1a-3d2f8b9c0a11", title: "Bake Sale", eventDate: "2026-12-03", googleEventId: null };

describe("calendarConfigFromEnv", () => {
  const sa = { client_email: "sa@p.iam.gserviceaccount.com", private_key: "KEY", token_uri: "https://oauth2.googleapis.com/token" };

  it("is off unless both the key file and the calendar id are set", () => {
    expect(calendarConfigFromEnv({})).toBeNull();
    expect(calendarConfigFromEnv({ GOOGLE_SA_JSON: JSON.stringify(sa) })).toBeNull();
    expect(calendarConfigFromEnv({ GOOGLE_CALENDAR_ID: "c@group.calendar.google.com" })).toBeNull();
    expect(calendarConfigFromEnv({ GOOGLE_CALENDAR_ID: "c", GOOGLE_SA_JSON: "{not json" })).toBeNull();
    expect(calendarConfigFromEnv({ GOOGLE_CALENDAR_ID: "c", GOOGLE_SA_JSON: JSON.stringify({ private_key: "K" }) })).toBeNull();
  });

  it("takes the key file as JSON or as base64", () => {
    const want = { calendarId: "c", clientEmail: sa.client_email, privateKey: "KEY", tokenUrl: sa.token_uri };
    expect(calendarConfigFromEnv({ GOOGLE_CALENDAR_ID: "c", GOOGLE_SA_JSON: JSON.stringify(sa) })).toMatchObject(want);
    const b64 = Buffer.from(JSON.stringify(sa)).toString("base64");
    expect(calendarConfigFromEnv({ GOOGLE_CALENDAR_ID: "c", GOOGLE_SA_JSON: b64 })).toMatchObject(want);
  });
});

describe("eventIdFor", () => {
  it("uses only the characters Google allows in event ids", () => {
    expect(eventIdFor(timeline.id)).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(eventIdFor("tl-Ä")).toMatch(/^[0-9a-v]{5,1024}$/);
  });
});

describe("putCalendarEvent", () => {
  it("creates an all-day event under the timeline's own id, then updates that one", async () => {
    const g = fakeGoogle();
    const id = await putCalendarEvent(g.config, timeline, g.fetch);
    expect(id).toBe(eventIdFor(timeline.id));
    expect(g.live()).toEqual([
      expect.objectContaining({
        id,
        summary: "Bake Sale",
        start: { date: "2026-12-03" },
        end: { date: "2026-12-04" },
        transparency: "transparent",
      }),
    ]);
    await putCalendarEvent(g.config, { ...timeline, title: "Bake Sale (moved)", eventDate: "2026-12-10", googleEventId: id }, g.fetch);
    expect(g.live()).toEqual([
      expect.objectContaining({ id, summary: "Bake Sale (moved)", start: { date: "2026-12-10" }, end: { date: "2026-12-11" } }),
    ]);
    expect(g.calls).toEqual([`POST`, `PUT ${id}`]);
    expect(g.tokenCount()).toBe(1);
  });

  it("brings back an event deleted earlier instead of making a second one", async () => {
    const g = fakeGoogle();
    const id = await putCalendarEvent(g.config, timeline, g.fetch);
    await deleteCalendarEvent(g.config, id, g.fetch);
    expect(g.live()).toEqual([]);
    expect(await putCalendarEvent(g.config, timeline, g.fetch)).toBe(id);
    expect(g.live().map((e) => e.id)).toEqual([id]);
  });

  it("makes a new event when the stored one is gone from Google", async () => {
    const g = fakeGoogle();
    const id = await putCalendarEvent(g.config, { ...timeline, googleEventId: "someoldid" }, g.fetch);
    expect(id).toBe(eventIdFor(timeline.id));
    expect(g.calls).toEqual(["PUT someoldid", "POST"]);
  });

  it("fails loudly when the service account can't sign in", async () => {
    const g = fakeGoogle();
    const wrongKey = fakeGoogle().config.privateKey;
    await expect(putCalendarEvent({ ...g.config, privateKey: wrongKey }, timeline, g.fetch)).rejects.toBeInstanceOf(CalendarError);
    expect(g.live()).toEqual([]);
  });
});

describe("deleteCalendarEvent", () => {
  it("counts an event that's already gone as deleted", async () => {
    const g = fakeGoogle();
    const id = await putCalendarEvent(g.config, timeline, g.fetch);
    await deleteCalendarEvent(g.config, id, g.fetch);
    await expect(deleteCalendarEvent(g.config, id, g.fetch)).resolves.toBeUndefined();
    await expect(deleteCalendarEvent(g.config, "neverwas", g.fetch)).resolves.toBeUndefined();
  });
});
