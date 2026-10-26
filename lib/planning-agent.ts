import { isRealYmd } from "./event-rules";
import { templatesFor, type PlanTag } from "./planning";
import type { PlanningAgent } from "./playbook";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** No model is configured in the app. This bounded local fallback is explicit
 * about assumptions; replacing it requires only the PlanningAgent interface. */
export const localPlanningAgent: PlanningAgent = {
  async propose({ description, todayYmd, cards }) {
    const notes = [
      "Review the suggested date and steps. This local planner uses keywords; it may miss details.",
    ];
    const tags: PlanTag[] = [];
    // Remove explicit negatives before matching, so “no food” doesn't add Food.
    const positive = description
      .toLowerCase()
      .replace(
        /\b(?:no|without|don't need|do not need|not serving)\s+(?:a\s+|any\s+)?(?:food|room|funding|catering|dinner|lunch|venue)\b/g,
        "",
      );
    const tests: [PlanTag, RegExp][] = [
      ["room", /\b(room|venue|on[ -]campus|hall|lounge)\b/],
      [
        "food",
        /\b(food|iftar|dinner|lunch|breakfast|catering|snacks|potluck)\b/,
      ],
      ["funding", /\b(funding|funds|budget|grant|reimburse|money)\b/],
      ["big", /\b(big|large|major|public|concert|conference)\b/],
      ["offcampus", /\boff[ -]campus\b/],
      ["collab", /\b(collab|collaboration|partner|cohost|co-host)\b/],
    ];
    for (const [tag, pattern] of tests)
      if (pattern.test(positive)) tags.push(tag);
    const size = description.match(
      /(?:~|about\s+|around\s+)?(\d{1,5})\s*(?:people|attendees|guests|students)\b/i,
    );
    if (size && Number(size[1]) > 100 && !tags.includes("big"))
      tags.push("big");
    if (size && Number(size[1]) > 250)
      notes.push(
        "Over 250 people: the guide calls for 8 weeks. Review the large-event proposal deadline with your advisor.",
      );
    if (tags.includes("offcampus"))
      notes.push(
        "The guide says there are no official off-campus events. Confirm the plan with your advisor.",
      );
    let eventYmd: string | null = null;
    const iso = description.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const named = description.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i,
    );
    if (iso) {
      eventYmd = isRealYmd(iso[1]) ? iso[1] : null;
      if (!eventYmd)
        notes.push(
          "That date isn't a real calendar date. Enter the correct date below.",
        );
    } else if (named) {
      const month =
        MONTHS.findIndex((m) => m.startsWith(named[1].toLowerCase())) + 1;
      const year = named[3] ? Number(named[3]) : Number(todayYmd.slice(0, 4));
      const make = (y: number) =>
        `${y}-${String(month).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
      let candidate = make(year);
      if (!named[3] && candidate < todayYmd) candidate = make(year + 1);
      eventYmd = isRealYmd(candidate) ? candidate : null;
      if (!named[3] && eventYmd)
        notes.push(
          `No year was given. Suggested ${eventYmd.slice(0, 4)}; confirm it below.`,
        );
    }
    if (!eventYmd)
      notes.push("Choose an event date to see the dated timeline.");
    const title =
      description.split(/[,\n]/)[0].trim().slice(0, 200) || "New event";
    return {
      title,
      eventYmd,
      tags,
      cardIds: templatesFor(tags, cards).map((c) => c.id),
      notes,
    };
  },
};

export function getPlanningAgent(): PlanningAgent {
  return localPlanningAgent;
}
