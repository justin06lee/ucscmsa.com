import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  leadLabel,
  validateCardGraph,
  type PlaybookCard,
} from "./playbook";
import { localPlanningAgent } from "./planning-agent";
import { templatesFor } from "./planning";

const card = (
  id: string,
  daysBefore: number,
  dependencies: string[] = [],
  tag: PlaybookCard["tag"] = null,
): PlaybookCard => ({
  id,
  daysBefore,
  dependencies,
  tag,
  title: id,
  body: "Instructions",
  revision: 1,
  sort: 0,
  guideSlug: null,
});

describe("playbook timeline", () => {
  it("uses calendar dates across DST, leap days, months and year boundaries", () => {
    const steps = [
      card("four-weeks", 28),
      card("three-days", 3),
      card("day-of", 0),
    ];
    expect(
      buildTimeline(
        "2027-03-15",
        steps.map((s) => s.id),
        steps,
        "2027-01-01",
      ).map((s) => s.dueDate),
    ).toEqual(["2027-02-15", "2027-03-12", "2027-03-15"]);
    expect(
      buildTimeline("2028-03-01", ["three-days"], steps, "2028-01-01")[0]
        .dueDate,
    ).toBe("2028-02-27");
    expect(
      buildTimeline("2027-01-02", ["three-days"], steps, "2026-12-01")[0]
        .dueDate,
    ).toBe("2026-12-30");
  });
  it("includes shared prerequisites once and schedules them no later than their dependents", () => {
    const steps = [
      card("approval", 7, [], "big"),
      card("food", 14, ["approval"], "food"),
      card("room", 14, ["approval"], "room"),
    ];
    const selected = templatesFor(["food", "room"], steps);
    expect(selected.map((c) => c.id)).toEqual(["approval", "food", "room"]);
    const timeline = buildTimeline(
      "2027-03-12",
      ["food", "room"],
      steps,
      "2027-01-01",
    );
    expect(timeline.map((t) => t.cardId)).toEqual(["approval", "food", "room"]);
    expect(timeline.every((t) => t.dueDate === "2027-02-26")).toBe(true);
    expect(timeline[0].warnings).toContain("Needed earlier by another step.");
    expect(timeline[1].warnings.join(" ")).toContain("Allow time for approval");
  });
  it("warns on overdue and tight deadlines without moving them to today", () => {
    const steps = [
      card("late", 28),
      card("tight", 3),
      card("today", 1),
      card("event", 0),
    ];
    const timeline = buildTimeline(
      "2027-03-12",
      steps.map((s) => s.id),
      steps,
      "2027-03-11",
    );
    expect(timeline[0]).toMatchObject({
      dueDate: "2027-02-12",
      warnings: [
        "Deadline has passed. Check with your advisor before committing.",
      ],
    });
    expect(timeline[1].warnings[0]).toMatch(/passed/);
    expect(timeline[2].warnings[0]).toMatch(/Tight/);
    expect(timeline[3].warnings[0]).toMatch(/Tight/);
  });
  it("rejects cycles, self-dependency, missing prerequisites and invalid dates", () => {
    expect(
      validateCardGraph([card("a", 1, ["b"]), card("b", 2, ["a"])]),
    ).toMatch(/circle/);
    expect(validateCardGraph([card("a", 1, ["a"])])).toMatch(/circle/);
    expect(validateCardGraph([card("a", 1, ["missing"])])).toMatch(
      /no longer exists/,
    );
    expect(() =>
      buildTimeline("2027-02-30", ["a"], [card("a", 1)], "2027-01-01"),
    ).toThrow();
    expect([0, 1, 3, 7, 28].map(leadLabel)).toEqual([
      "Day of",
      "1 day before",
      "3 days before",
      "1 week before",
      "4 weeks before",
    ]);
  });
});

describe("local planning agent", () => {
  const cards = [
    card("proposal", 14),
    card("room", 14, ["proposal"], "room"),
    card("purchase", 10, ["proposal"], "food"),
    card("big", 42, [], "big"),
  ];
  it("handles Justin's example, suggests the next March, and states the assumption", async () => {
    const p = await localPlanningAgent.propose({
      description: "Iftar, March 12, ~80 people, serving food, need a room",
      todayYmd: "2026-10-25",
      cards,
    });
    expect(p).toMatchObject({
      title: "Iftar",
      eventYmd: "2027-03-12",
      tags: ["room", "food"],
      cardIds: ["proposal", "room", "purchase"],
    });
    expect(p.notes.join(" ")).toContain("No year was given");
  });
  it("asks for a missing or impossible date and respects explicit negatives", async () => {
    const p = await localPlanningAgent.propose({
      description: "Study circle, no room, no food",
      todayYmd: "2026-10-25",
      cards,
    });
    expect(p.eventYmd).toBeNull();
    expect(p.tags).toEqual([]);
    expect(p.cardIds).toEqual(["proposal"]);
    const invalid = await localPlanningAgent.propose({
      description: "Lunch 2027-02-30",
      todayYmd: "2026-10-25",
      cards,
    });
    expect(invalid.eventYmd).toBeNull();
  });
  it("keeps explicit past years and warns about major events", async () => {
    const p = await localPlanningAgent.propose({
      description: "Dinner, March 12 2025, 300 people",
      todayYmd: "2026-10-25",
      cards,
    });
    expect(p.eventYmd).toBe("2025-03-12");
    expect(p.tags).toContain("big");
    expect(p.notes.join(" ")).toContain("8 weeks");
  });
});
