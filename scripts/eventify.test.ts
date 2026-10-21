// @vitest-environment node
import { describe, expect, it } from "vitest";
import { draftToOperation, eventify, extractJson, groundLinks, type CallModel, type SourceItem } from "./eventify";

const base: SourceItem = {
  sourceId: "wa:TEST1",
  sourceRef: "WhatsApp MSA announcements, 2026-02-01 12:00",
  sentDate: "2026-02-01",
  text: "",
};

// A model mock: route by model id to a canned JSON reply.
function mockCall(replies: Record<string, unknown>, calls?: string[]): CallModel {
  return async (req) => {
    calls?.push(req.model);
    const r = replies[req.model];
    if (r === undefined) throw new Error(`no mock for ${req.model}`);
    return typeof r === "string" ? r : JSON.stringify(r);
  };
}

const opts = (replies: Record<string, unknown>, calls?: string[]) => ({
  call: mockCall(replies, calls),
  primaryModel: "haiku",
  verifierModel: "sonnet",
});

const claim = (value: string | null, source = "text", quote: string | null = null) => ({ value, source, quote });

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses inside a ```json fence with prose around it", () => {
    expect(extractJson('Sure!\n```json\n{"a":2}\n```\nDone')).toEqual({ a: 2 });
  });
  it("takes the last complete object when several are present", () => {
    expect(extractJson('{"a":1} then {"a":2}')).toEqual({ a: 2 });
  });
  it("handles braces inside strings", () => {
    expect(extractJson('{"t":"a } b { c"}')).toEqual({ t: "a } b { c" });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("eventify", () => {
  it("marks a non-event as skipped without a verifier call", async () => {
    const calls: string[] = [];
    const d = await eventify(
      { ...base, text: "Fill out this feedback form!" },
      opts({ haiku: { isEvent: false, skipReason: "feedback form", confidence: 0.9 } }, calls),
    );
    expect(d.isEvent).toBe(false);
    expect(d.skipReason).toBe("feedback form");
    expect(calls).toEqual(["haiku"]);
  });

  it("keeps a start time quoted from the text, no verifier call", async () => {
    const calls: string[] = [];
    const d = await eventify(
      { ...base, text: "Game Night this Thursday at 7:00 PM in McHenry!" },
      opts(
        {
          haiku: {
            isEvent: true,
            title: "Game Night",
            date: claim("2026-02-05"),
            startTime: claim("19:00", "text", "7:00 PM"),
            endTime: claim(null, "none"),
            confidence: 0.9,
          },
        },
        calls,
      ),
    );
    expect(d.startTime).toBe("19:00");
    expect(d.endTime).toBeUndefined();
    expect(d.needsReview).toBe(false);
    expect(calls).toEqual(["haiku"]); // text-quoted time needs no verifier
  });

  it("keeps a flyer time only when the verifier agrees", async () => {
    const withImg = { ...base, text: "Join us!", imageBase64: "x", imageMediaType: "image/jpeg" };
    const calls: string[] = [];
    const agree = await eventify(
      withImg,
      opts(
        {
          haiku: { isEvent: true, title: "Social", date: claim("2026-02-10"), startTime: claim("18:00", "flyer"), confidence: 0.9 },
          sonnet: { isEvent: true, title: "Social", date: claim("2026-02-10"), startTime: claim("18:00", "flyer"), confidence: 0.9 },
        },
        calls,
      ),
    );
    expect(agree.startTime).toBe("18:00");
    expect(calls).toEqual(["haiku", "sonnet"]);

    const disagree = await eventify(
      withImg,
      opts({
        haiku: { isEvent: true, title: "Social", date: claim("2026-02-10"), startTime: claim("18:00", "flyer"), confidence: 0.9 },
        sonnet: { isEvent: true, title: "Social", date: claim("2026-02-10"), startTime: claim("17:00", "flyer"), confidence: 0.9 },
      }),
    );
    expect(disagree.startTime).toBeUndefined();
    expect(disagree.reviewNotes.join(" ")).toMatch(/verifier read 17:00/);
  });

  it("drops a flyer-only time when there is no image to verify", async () => {
    const d = await eventify(
      { ...base, text: "See the flyer" },
      opts({ haiku: { isEvent: true, title: "X", date: claim("2026-03-01"), startTime: claim("18:00", "flyer"), confidence: 0.9 } }),
    );
    expect(d.startTime).toBeUndefined();
    expect(d.reviewNotes.join(" ")).toMatch(/flyer that isn't available/);
  });

  it("drops a stranded end time with no start time", async () => {
    const d = await eventify(
      { ...base, text: "Ends at 8 PM" },
      opts({ haiku: { isEvent: true, title: "X", date: claim("2026-03-01"), startTime: claim(null, "none"), endTime: claim("20:00", "text", "8 PM"), confidence: 0.9 } }),
    );
    expect(d.endTime).toBeUndefined();
    expect(d.reviewNotes.join(" ")).toMatch(/no start time to anchor/);
  });

  it('prefixes a hosted event with "Hosted by"', async () => {
    const d = await eventify(
      { ...base, text: "SWANA fragrance workshop" },
      opts({ haiku: { isEvent: true, title: "Fragrance Workshop", date: claim("2026-04-07"), hostOrg: "SWANA", description: "A fragrance workshop.", confidence: 0.9 } }),
    );
    expect(d.description).toBe("Hosted by SWANA. A fragrance workshop.");
  });

  it("does not double-prefix when the description already says Hosted by", async () => {
    const d = await eventify(
      base,
      opts({ haiku: { isEvent: true, title: "X", date: claim("2026-04-07"), hostOrg: "SJP", description: "Hosted by SJP. A vigil.", confidence: 0.9 } }),
    );
    expect(d.description).toBe("Hosted by SJP. A vigil.");
  });

  it("flags low confidence and a missing date for review", async () => {
    const lowConf = await eventify(base, opts({ haiku: { isEvent: true, title: "X", date: claim("2026-04-07"), confidence: 0.3 } }));
    expect(lowConf.needsReview).toBe(true);

    const noDate = await eventify(base, opts({ haiku: { isEvent: true, title: "X", date: claim(null, "none"), confidence: 0.9 } }));
    expect(noDate.needsReview).toBe(true);
    expect(noDate.reviewNotes.join(" ")).toMatch(/no determinable date/);
  });

  it("recovers from prose and a code fence around the JSON", async () => {
    const d = await eventify(base, opts({ haiku: 'Here you go:\n```json\n{"isEvent":true,"title":"X","date":{"value":"2026-05-01"},"confidence":0.9}\n```' }));
    expect(d.isEvent).toBe(true);
    expect(d.date).toBe("2026-05-01");
  });
});

describe("groundLinks", () => {
  it("keeps a URL that is in the text, with the model's kind and label", () => {
    const text = "RSVP for the address: https://forms.gle/abc123";
    const links = groundLinks(text, [{ kind: "form", label: "RSVP form", url: "https://forms.gle/abc123" }]);
    expect(links).toEqual([{ kind: "form", label: "RSVP form", url: "https://forms.gle/abc123" }]);
  });

  it("drops a URL the model invented that is not in the text", () => {
    const links = groundLinks("Come to the potluck!", [{ kind: "rsvp", label: "x", url: "https://evil.example/phish" }]);
    expect(links).toEqual([]);
  });

  it("keeps a URL in the text the model missed, inferring the kind", () => {
    const links = groundLinks("Give here: https://launchgood.com/campaign and maps https://maps.app.goo.gl/xyz", []);
    expect(links.map((l) => l.kind)).toEqual(["donate", "map"]);
  });

  it("strips trailing punctuation and de-duplicates", () => {
    const links = groundLinks("See https://partiful.com/e/AbC. Again: https://partiful.com/e/AbC", []);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ kind: "rsvp", label: "partiful.com", url: "https://partiful.com/e/AbC" });
  });
});

describe("eventify links and images", () => {
  it("grounds links from the text and passes images through", async () => {
    const d = await eventify(
      { ...base, text: "Beach social! RSVP: https://partiful.com/e/XY", imagePaths: ["/t/a-1.jpg", "/t/a-2.jpg"] },
      opts({ haiku: { isEvent: true, title: "Beach Social", date: claim("2026-07-18"), links: [{ kind: "rsvp", label: "RSVP", url: "https://partiful.com/e/XY" }], confidence: 0.9 } }),
    );
    expect(d.links).toEqual([{ kind: "rsvp", label: "RSVP", url: "https://partiful.com/e/XY" }]);
    expect(d.images).toEqual(["/t/a-1.jpg", "/t/a-2.jpg"]);
  });
});

describe("draftToOperation", () => {
  it("builds a date-only upsert with no times", () => {
    const op = draftToOperation({
      sourceId: "wa:A",
      sourceRef: "ref",
      isEvent: true,
      title: "Potluck",
      date: "2026-02-19",
      links: [],
      images: [],
      confidence: 0.9,
      needsReview: false,
      reviewNotes: [],
    });
    expect(op).toEqual({ op: "upsert", sourceId: "wa:A", sourceRef: "ref", event: { title: "Potluck", date: "2026-02-19" } });
  });

  it("includes start and end when present", () => {
    const op = draftToOperation({
      sourceId: "wa:B",
      sourceRef: "ref",
      isEvent: true,
      title: "Jeopardy",
      date: "2026-01-07",
      startTime: "17:00",
      endTime: "19:00",
      location: "McHenry",
      description: "Fun",
      links: [],
      images: [],
      confidence: 0.9,
      needsReview: false,
      reviewNotes: [],
    });
    expect(op.event).toEqual({ title: "Jeopardy", date: "2026-01-07", description: "Fun", location: "McHenry", startTime: "17:00", endTime: "19:00" });
  });
});
