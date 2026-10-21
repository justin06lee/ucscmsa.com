import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/db";
import { getPrayerTimes, DEFAULT_PRAYER_TIMES } from "./aladhan";
import { prayerTimesCache } from "@/lib/db/schema";

// Tests pin "now" so the dates below stay inside the cache window.
const NOW = new Date("2026-04-16T19:00:00.000Z");

const aladhanResponse = () =>
  new Response(
    JSON.stringify({
      data: {
        timings: {
          Fajr: "05:18",
          Sunrise: "06:38",
          Dhuhr: "13:07",
          Asr: "16:45",
          Maghrib: "19:35",
          Isha: "20:47",
        },
      },
    }),
    { status: 200 }
  );

describe("getPrayerTimes", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns cached row when present", async () => {
    const { db, client } = await createTestDb();
    await db.insert(prayerTimesCache).values({
      date: "2026-04-16",
      fajr: "05:18",
      sunrise: "06:38",
      dhuhr: "13:07",
      asr: "16:45",
      maghrib: "19:35",
      isha: "20:47",
    });

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const result = await getPrayerTimes("2026-04-16", db, NOW);

    expect(result.fajr).toBe("05:18");
    expect(result.isha).toBe("20:47");
    expect(fetchSpy).not.toHaveBeenCalled();
    client.close();
  });

  it("fetches and caches on miss", async () => {
    const { db, client } = await createTestDb();
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            timings: {
              Fajr: "05:18",
              Sunrise: "06:38",
              Dhuhr: "13:07",
              Asr: "16:45",
              Maghrib: "19:35",
              Isha: "20:47",
            },
          },
        }),
        { status: 200 }
      )
    ) as unknown as typeof globalThis.fetch;

    const result = await getPrayerTimes("2026-04-16", db, NOW);
    expect(result.fajr).toBe("05:18");

    const rows = await db.select().from(prayerTimesCache);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-04-16");
    client.close();
  });

  it("returns defaults and does not cache on fetch failure", async () => {
    const { db, client } = await createTestDb();
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof globalThis.fetch;

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await getPrayerTimes("2026-04-16", db, NOW);
    expect(result).toEqual(DEFAULT_PRAYER_TIMES);
    expect(warn).toHaveBeenCalled();

    const rows = await db.select().from(prayerTimesCache);
    expect(rows).toHaveLength(0);
    client.close();
  });
  it("doesn't cache dates far from today, but still looks them up", async () => {
    const { db, client } = await createTestDb();
    const fetchSpy = vi.fn(async () => aladhanResponse());
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const result = await getPrayerTimes("1900-01-01", db, NOW);
    expect(result.fajr).toBe("05:18");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await getPrayerTimes("9999-12-31", db, NOW);
    expect(await db.select().from(prayerTimesCache)).toHaveLength(0);
    client.close();
  });

  it("returns defaults for impossible dates without fetching or caching", async () => {
    const { db, client } = await createTestDb();
    const fetchSpy = vi.fn(async () => aladhanResponse());
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    expect(await getPrayerTimes("2026-02-31", db, NOW)).toEqual(DEFAULT_PRAYER_TIMES);
    expect(await getPrayerTimes("2026-13-45", db, NOW)).toEqual(DEFAULT_PRAYER_TIMES);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await db.select().from(prayerTimesCache)).toHaveLength(0);
    client.close();
  });
});
