import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FROM, emailConfigFromEnv, sendEmail } from "@/lib/email";

const email = {
  to: "omar@ucsc.edu",
  subject: "Your step: Get a food permit",
  text: "Hi Omar,",
  oneClickUrl: "https://ucscmsa.com/api/notify/unsubscribe?u=u-omar&t=x",
  idempotencyKey: "assign:t:b:u-omar",
};

describe("emailConfigFromEnv", () => {
  it("is off without a key and uses the default sender", () => {
    expect(emailConfigFromEnv({})).toBeNull();
    expect(emailConfigFromEnv({ RESEND_API_KEY: " re_1 " })).toEqual({ apiKey: "re_1", from: DEFAULT_FROM });
    expect(emailConfigFromEnv({ RESEND_API_KEY: "re_1", EMAIL_FROM: "MSA <a@ucscmsa.com>" })?.from).toBe("MSA <a@ucscmsa.com>");
  });
});

describe("sendEmail", () => {
  it("sends nothing when off", async () => {
    const f = vi.fn();
    expect(await sendEmail(email, null, f)).toEqual({ sent: false, reason: "off" });
    expect(f).not.toHaveBeenCalled();
  });

  it("posts plain text to Resend with one-click unsubscribe headers", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const res = await sendEmail(email, { apiKey: "re_1", from: DEFAULT_FROM }, f as unknown as typeof fetch);
    expect(res).toEqual({ sent: true, id: "em_1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_1", "Idempotency-Key": "assign:t:b:u-omar" });
    expect(JSON.parse(String(init.body))).toEqual({
      from: DEFAULT_FROM,
      to: ["omar@ucsc.edu"],
      subject: email.subject,
      text: email.text,
      headers: {
        "List-Unsubscribe": `<${email.oneClickUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  });

  it("reports a refusal or a network error instead of throwing", async () => {
    const refused = vi.fn(async () => new Response("domain not verified", { status: 403 }));
    expect(await sendEmail(email, { apiKey: "re_1", from: DEFAULT_FROM }, refused as unknown as typeof fetch)).toEqual({
      sent: false,
      reason: "failed",
      detail: "403 domain not verified",
    });
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await sendEmail(email, { apiKey: "re_1", from: DEFAULT_FROM }, down as unknown as typeof fetch)).toMatchObject({
      sent: false,
      reason: "failed",
    });
  });
});
