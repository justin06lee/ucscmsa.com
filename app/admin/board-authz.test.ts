import { beforeEach, describe, expect, it, vi } from "vitest";

// The board's pages and actions, called by someone who isn't an admin: every
// one refuses before touching the database. Runs the real requireAdmin with
// Auth.js's auth() stubbed to return the session under test.

const h = vi.hoisted(() => ({
  session: null as null | { user: { id: string; isAdmin: boolean; adminId: number | null } },
  dbTouched: false,
}));

vi.mock("@/auth", () => ({ auth: async () => h.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not_found");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
// Any database access at all fails the test.
vi.mock("@/lib/db/client", () => ({
  db: new Proxy(
    {},
    {
      get() {
        h.dbTouched = true;
        throw new Error("db touched");
      },
    },
  ),
}));

import * as cardActions from "./playbook/_card-actions";
import * as agentActions from "./plan/_agent-actions";
import * as planActions from "./plan/_actions";
import * as playbookActions from "./playbook/_actions";
import * as eventActions from "./_actions";
import PlanningPage from "./plan/page";
import EventPlanPage from "./plan/[id]/page";
import LeadTimesPage from "./plan/settings/page";
import PlaybookPage from "./playbook/page";
import GuidePage from "./playbook/[slug]/page";
import EditGuidePage from "./playbook/[slug]/edit/page";

const fd = () => new FormData();

const actions: Array<[string, () => Promise<unknown>]> = [
  ["toggleTask", () => planActions.toggleTask("t1", true)],
  ["assignTask", () => planActions.assignTask("t1", "u1")],
  ["publishEvent", () => planActions.publishEvent("e1")],
  ["savePlaybookCard", () => cardActions.savePlaybookCard(null, {}, null)],
  ["deletePlaybookCard", () => cardActions.deletePlaybookCard("room", 1)],
  ["movePlaybookCards", () => cardActions.movePlaybookCards([], [])],
  ["loadCardHistory", () => cardActions.loadCardHistory("room")],
  ["restorePlaybookCard", () => cardActions.restorePlaybookCard("room", 1, 1)],
  ["suggestEventPlan", () => agentActions.suggestEventPlan("Iftar, March 12")],
  ["createEventFromPlan", () => agentActions.createEventFromPlan({})],
  ["saveGuide", () => playbookActions.saveGuide("funding", fd())],
  ["restoreGuide", () => playbookActions.restoreGuide("funding", 1)],
  ["createEvent (draft + tags)", () => eventActions.createEvent(fd())],
  ["updateEvent (draft + tags)", () => eventActions.updateEvent("e1", fd())],
];

const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const pages: Array<[string, () => Promise<unknown>]> = [
  ["/admin/plan", () => PlanningPage()],
  ["/admin/plan/[id]", () => EventPlanPage(params({ id: "e1" }))],
  ["/admin/plan/settings", () => LeadTimesPage()],
  ["/admin/playbook", () => PlaybookPage()],
  ["/admin/playbook/[slug]", () => GuidePage(params({ slug: "funding" }))],
  ["/admin/playbook/[slug]/edit", () => EditGuidePage(params({ slug: "funding" }))],
];

describe.each([
  ["signed out", null],
  ["signed in, not an admin", { user: { id: "u9", isAdmin: false, adminId: null } }],
])("board section, %s", (_, session) => {
  beforeEach(() => {
    h.session = session;
    h.dbTouched = false;
  });

  it.each(actions)("action %s is refused", async (_, call) => {
    await expect(call()).rejects.toThrow("unauthorized");
    expect(h.dbTouched).toBe(false);
  });

  it.each(pages)("page %s is refused", async (_, render) => {
    await expect(render()).rejects.toThrow("unauthorized");
    expect(h.dbTouched).toBe(false);
  });
});
