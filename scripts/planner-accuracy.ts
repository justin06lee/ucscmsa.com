// Report-only: scores the timeline planner against a hand-made answer key.
// For each description: the real DeepInfra model (its raw reply, and the plan
// the site ships after its code fixes), and the keyword rules alone.
// Usage: DEEPINFRA_API_KEY=... TURSO_DATABASE_URL=file:/tmp/x.db bun scripts/planner-accuracy.ts [runs]
// (a database seeded by scripts/seed-local.ts; never production). Results:
// docs/audits/2026-10-28-planner-accuracy.md.
import { db } from "@/lib/db/client";
import { loadPlanSteps } from "@/lib/playbook-db";
import { planTurn, readReply, ruleTurn, type TurnResult } from "@/lib/timeline-llm";
import { buildItems, type EventSize } from "@/lib/timeline-plan";
import type { TimelineChatTurn } from "@/lib/db/schema";

const TODAY = "2026-10-28"; // a Wednesday
const RUNS = Number(process.argv[2] ?? 2);

// Step numbers as the Playbook lists them (checked against the titles below).
const TITLES: Record<number, string> = {
  1: "File the Event Proposal", 2: "Meet an advisor", 3: "Ask for a tent or AV equipment",
  4: "Going off campus? Talk to your advisor", 5: "Get a food permit",
  6: "Paying a speaker or performer? Start the paperwork", 7: "Fundraiser? Meet an advisor about it",
  9: "Pick a space", 10: "Send the booking request", 11: "Wait for the confirmation email",
  13: "Pick where the money comes from", 14: "Ask a college for funding", 15: "Spend it through the campus account",
  16: "New vendor? Get the 204 payee setup", 17: "Send the speaker or performer's Purchase Request",
  18: "Send the Purchase Request", 19: "Keep the itemized receipt", 20: "Make the flyer", 21: "Post it",
  22: "Table at the library", 23: "Send a reminder", 24: "Keep an attendance log",
  25: "Thank people and post photos", 26: "File reimbursements",
};

// Every on-campus event in a booked space: the proposal and its advisor
// meeting, the room, promotion and the wrap-up.
const BASE = [1, 2, 9, 10, 11, 20, 21, 23, 24, 25];
const WRAP = [20, 21, 23, 24, 25];
// Food: the permit, the order, its receipt, and reimbursement (money spent).
const FOOD = [5, 18, 19, 26];

type Key = { gist: string; date: string; size: EventSize; need: number[]; mayAlso?: number[] };
const KEY: Record<string, Key> = {
  // The seven from the October 27 rounds.
  a: { gist: "halaqa thursday night in a classroom, ~15 people, no food", date: "2026-10-29", size: "small", need: BASE },
  b: { gist: "weekly jummah", date: "2026-12-03", size: "small", need: BASE },
  c: { gist: "halaqa with pizza, ~40 people", date: "2026-12-03", size: "small", need: [...BASE, ...FOOD], mayAlso: [16] },
  d: { gist: "big eid dinner, 150 people, catered, need funding", date: "2026-12-03", size: "large",
       need: [...BASE, ...FOOD, 13, 15], mayAlso: [3, 14, 16] },
  // "Outside speaker" doesn't say paid: the payment steps are allowed, not required.
  e: { gist: "bringing an outside speaker, ticketed, in a big hall", date: "2026-12-03", size: "mid",
       need: BASE, mayAlso: [3, 6, 16, 17, 19, 26] },
  f: { gist: "beach cleanup off campus", date: "2026-12-03", size: "small", need: [1, 4, ...WRAP], mayAlso: [2] },
  g: { gist: "bake sale fundraiser on campus", date: "2026-12-03", size: "small", need: [...BASE, ...FOOD], mayAlso: [16, 22] },
  // Eight more, worded the way board members write.
  h: { gist: "day trip to the Monterey Bay Aquarium on Saturday Nov 14, 25 students carpooling, we need funding for the tickets",
       date: "2026-11-14", size: "small", need: [1, 4, 13, 15, 26, ...WRAP], mayAlso: [2, 14, 16, 18, 19] },
  i: { gist: "samosa sale fundraiser at Quarry Plaza on November 18, we'll cook at home and sell for charity",
       date: "2026-11-18", size: "small", need: [...BASE, 5, 19, 26], mayAlso: [16, 18, 22] },
  j: { gist: "an imam from the Bay Area is giving a talk, we're paying him a $300 honorarium, about 60 students at the Stevenson Event Center",
       date: "2026-12-03", size: "mid", need: [...BASE, 6, 17, 26], mayAlso: [3, 13, 15, 16, 19] },
  k: { gist: "small sisters study halaqa, 8 people, in a library study room, Monday at 6pm",
       date: "2026-11-02", size: "small", need: BASE },
  l: { gist: "Eid dinner open to the whole Santa Cruz community, around 300 guests, catered by a halal restaurant, asking the colleges for funding",
       date: "2026-12-03", size: "major", need: [...BASE, ...FOOD, 13, 14, 15], mayAlso: [3, 16] },
  m: { gist: "jummah prayer every friday in the redwood lounge", date: "2026-10-30", size: "small", need: BASE },
  n: { gist: "ticketed nasheed concert with a paid performer, $10 tickets, about 120 people in the Music Center Recital Hall",
       date: "2026-12-03", size: "large", need: [...BASE, 6, 17, 26], mayAlso: [3, 7, 16, 19] },
  o: { gist: "tabling at the library to recruit new members and hand out flyers",
       date: "2026-12-03", size: "small", need: [1, 20, 22], mayAlso: [2, 9, 10, 11, 21, 23, 24, 25] },
  // Five held out: written after the October 28 fixes, not used to make them.
  p: { gist: "movie night in the Oakes learning center with popcorn and drinks, maybe 30 people",
       date: "2026-12-03", size: "small", need: [...BASE, ...FOOD], mayAlso: [3, 16] },
  q: { gist: "virtual Quran reading session on Zoom every Tuesday", date: "2026-11-03", size: "small", need: [1, 2, ...WRAP] },
  // Bring-your-own lunch: no food is served, so no food steps.
  r: { gist: "hiking trip to Henry Cowell park this Sunday, bring your own lunch", date: "2026-11-01", size: "small",
       need: [1, 4, ...WRAP], mayAlso: [2] },
  s: { gist: "charity car wash fundraiser in the East Remote parking lot", date: "2026-12-03", size: "small",
       need: BASE, mayAlso: [16, 18, 19, 26] },
  t: { gist: "career panel with three alumni speakers (unpaid), about 70 students, Humanities Lecture Hall, pizza after",
       date: "2026-12-03", size: "mid", need: [...BASE, ...FOOD], mayAlso: [3, 16] },
};

const answer = (q: string) => (/when|date|day/i.test(q) ? "December 3" : "Not sure yet");

const steps = await loadPlanSteps(db);
for (const [n, title] of Object.entries(TITLES)) {
  if (steps[Number(n) - 1]?.title !== title) throw new Error(`step ${n} is "${steps[Number(n) - 1]?.title}", not "${title}"`);
}
const num = (id: string) => steps.findIndex((s) => s.id === id) + 1;

type Plan = { date: string; size: EventSize; steps: Set<number>; source: string; asked: number };
async function run(gist: string, mode: "ai" | "rules"): Promise<{ shipped: Plan; raw: Plan | null }> {
  const chat: TimelineChatTurn[] = [{ role: "user", text: gist }];
  let lastRaw = "";
  const spy: typeof fetch = async (url, init) => {
    const res = await fetch(url, init);
    const text = await res.text();
    try {
      lastRaw = (JSON.parse(text) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
    } catch {
      lastRaw = "";
    }
    return new Response(text, { status: res.status, headers: res.headers });
  };
  let asked = 0;
  for (let i = 0; i < 4; i++) {
    const turn: TurnResult =
      mode === "ai"
        ? await planTurn({ chat, steps, today: TODAY, apiKey: process.env.DEEPINFRA_API_KEY, fetchImpl: spy })
        : ruleTurn(chat, steps, TODAY);
    if (turn.type === "question") {
      asked++;
      chat.push({ role: "assistant", text: turn.question }, { role: "user", text: answer(turn.question) });
      continue;
    }
    const items = buildItems(steps, turn.stepIds, turn.eventDate, turn.size, TODAY);
    const shipped = { date: turn.eventDate, size: turn.size, steps: new Set(items.map((it) => num(it.stepId ?? ""))), source: turn.source, asked };
    const r = mode === "ai" && turn.source === "ai" ? readReply(lastRaw, steps, TODAY) : null;
    const raw = r?.type === "timeline" ? { date: r.eventDate, size: r.size, steps: new Set(r.stepIds.map(num)), source: "raw", asked } : null;
    return { shipped, raw };
  }
  throw new Error("no timeline after 4 turns");
}

type Score = { date: boolean; size: boolean; missing: number[]; extra: number[]; precision: number; recall: number; pass: boolean };
function score(k: Key, p: Plan): Score {
  const need = new Set(k.need);
  const ok = new Set([...k.need, ...(k.mayAlso ?? [])]);
  const got = [...p.steps];
  const missing = k.need.filter((n) => !p.steps.has(n));
  const extra = got.filter((n) => !ok.has(n)).sort((x, y) => x - y);
  const hits = got.filter((n) => ok.has(n)).length;
  const date = p.date === k.date;
  const size = p.size === k.size;
  return {
    date, size, missing, extra,
    precision: got.length ? hits / got.length : 0,
    recall: (k.need.length - missing.length) / need.size,
    pass: date && size && missing.length === 0 && extra.length === 0,
  };
}

const totals: Record<string, { n: number; date: number; size: number; pass: number; p: number; r: number; miss: number; extra: number }> = {};
const add = (label: string, s: Score) => {
  const t = (totals[label] ??= { n: 0, date: 0, size: 0, pass: 0, p: 0, r: 0, miss: 0, extra: 0 });
  t.n++; t.date += +s.date; t.size += +s.size; t.pass += +s.pass; t.p += s.precision; t.r += s.recall;
  t.miss += s.missing.length; t.extra += s.extra.length;
};
const line = (label: string, k: Key, p: Plan, s: Score) =>
  console.log(
    `  ${label.padEnd(7)} ${s.pass ? "PASS" : "fail"} date ${p.date}${s.date ? "" : ` (want ${k.date})`} size ${p.size}${s.size ? "" : ` (want ${k.size})`}` +
      ` P ${(s.precision * 100).toFixed(0)}% R ${(s.recall * 100).toFixed(0)}%` +
      (s.missing.length ? ` missing ${s.missing.map((n) => `#${n}`).join(",")}` : "") +
      (s.extra.length ? ` extra ${s.extra.map((n) => `#${n}`).join(",")}` : "") +
      (p.source !== "ai" && p.source !== "raw" && label.startsWith("ship") ? ` [${p.source}]` : ""),
  );

for (const [id, k] of Object.entries(KEY)) {
  console.log(`\n${id}: ${k.gist}`);
  for (let r = 1; r <= RUNS; r++) {
    const ai = await run(k.gist, "ai");
    if (ai.raw) {
      const s = score(k, ai.raw);
      add("model", s);
      line(`model${r}`, k, ai.raw, s);
    } else console.log(`  model${r} (no usable model reply; source ${ai.shipped.source})`);
    const s = score(k, ai.shipped);
    add("shipped", s);
    line(`ship${r}`, k, ai.shipped, s);
  }
  const rules = await run(k.gist, "rules");
  const s = score(k, rules.shipped);
  add("rules", s);
  line("rules", k, rules.shipped, s);
}

console.log("\nTOTALS (per run)");
for (const [label, t] of Object.entries(totals)) {
  const pct = (x: number) => `${((x / t.n) * 100).toFixed(0)}%`;
  console.log(
    `  ${label.padEnd(8)} runs ${t.n}  all right ${t.pass}/${t.n} (${pct(t.pass)})  date ${pct(t.date)}  size ${pct(t.size)}` +
      `  precision ${pct(t.p)}  recall ${pct(t.r)}  missing ${t.miss}  extra ${t.extra}`,
  );
}
