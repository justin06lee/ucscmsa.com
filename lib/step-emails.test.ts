import { describe, expect, it } from "vitest";
import { assignmentEmail, bucketSteps, dailyEmail, type DueStep } from "@/lib/step-emails";

const today = "2026-10-27";
const s = (title: string, due: string, done = false): DueStep => ({ title, timelineTitle: "Bake Sale", due, done });
const ARROWS = /[←-⇿⟵-⟿]|->|<-|=>/;

describe("bucketSteps", () => {
  it("sorts open steps into overdue (30 days back), today and the next 3 days", () => {
    const b = bucketSteps(
      [
        s("too old", "2026-09-26"),
        s("oldest kept", "2026-09-27"),
        s("yesterday", "2026-10-26"),
        s("done yesterday", "2026-10-26", true),
        s("today", "2026-10-27"),
        s("in 3 days", "2026-10-30"),
        s("in 4 days", "2026-10-31"),
      ],
      today,
    );
    expect(b.overdue.map((x) => x.title)).toEqual(["oldest kept", "yesterday"]);
    expect(b.today.map((x) => x.title)).toEqual(["today"]);
    expect(b.soon.map((x) => x.title)).toEqual(["in 3 days"]);
  });
});

describe("dailyEmail", () => {
  const base = { toName: "Omar Farouk", today, stepsUrl: "https://ucscmsa.com/admin/steps", muteUrl: "https://ucscmsa.com/unsubscribe?u=x&t=y" };

  it("is nothing when no step is overdue or close", () => {
    expect(dailyEmail({ ...base, steps: [s("later", "2026-11-20"), s("done", "2026-10-27", true)] })).toBeNull();
  });

  it("lists each group with dates, one link and the mute link", () => {
    const mail = dailyEmail({
      ...base,
      steps: [s("Get a food permit", "2026-10-25"), s("Send the booking request", today), s("Make the flyer", "2026-10-29")],
    })!;
    expect(mail.subject).toBe("Your MSA steps: 1 overdue, 1 due today, 1 coming up");
    expect(mail.text).toContain("Hi Omar,");
    expect(mail.text).toContain("Overdue\n- Get a food permit (Bake Sale), was due Sun, Oct 25");
    expect(mail.text).toContain("Due today\n- Send the booking request (Bake Sale)");
    expect(mail.text).toContain("Due in the next 3 days\n- Make the flyer (Bake Sale), due Thu, Oct 29");
    expect(mail.text).toContain("Your steps: https://ucscmsa.com/admin/steps");
    expect(mail.text).toContain("Stop them: https://ucscmsa.com/unsubscribe?u=x&t=y");
    expect(mail.text).not.toMatch(ARROWS);
  });

  it("leaves out empty groups", () => {
    const mail = dailyEmail({ ...base, steps: [s("Make the flyer", today)] })!;
    expect(mail.subject).toBe("Your MSA steps: 1 due today");
    expect(mail.text).not.toContain("Overdue");
    expect(mail.text).not.toContain("next 3 days");
  });
});

describe("assignmentEmail", () => {
  it("says who gave which step, for which event, and when it's due", () => {
    const mail = assignmentEmail({
      toName: "Omar Farouk",
      byName: "Aisha Karim",
      step: s("Get a food permit", "2026-11-19"),
      eventDate: "2026-12-03",
      stepsUrl: "https://ucscmsa.com/admin/steps",
      muteUrl: "https://ucscmsa.com/unsubscribe?u=x&t=y",
    });
    expect(mail.subject).toBe("Your step: Get a food permit");
    expect(mail.text).toBe(
      [
        "Hi Omar,",
        "",
        "Aisha gave you a step for Bake Sale (Thu, Dec 3):",
        "",
        "Get a food permit",
        "Due Thu, Nov 19",
        "",
        "Your steps: https://ucscmsa.com/admin/steps",
        "",
        "--",
        "You get these because you're on the MSA board. Stop them: https://ucscmsa.com/unsubscribe?u=x&t=y",
      ].join("\n"),
    );
  });
});
