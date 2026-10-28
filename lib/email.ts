// Sends plain-text email through Resend's HTTP API. Without RESEND_API_KEY it
// sends nothing and says so, so local runs and previews never email anyone.

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  /** One-click mute (RFC 8058): mail apps POST here from their own Unsubscribe button. */
  oneClickUrl: string;
  /** Resend drops a repeat of the same key within 24 hours. */
  idempotencyKey?: string;
};

export type SendResult = { sent: true; id: string } | { sent: false; reason: "off" | "failed"; detail?: string };

export type EmailConfig = { apiKey: string; from: string };

export const DEFAULT_FROM = "MSA at UCSC <steps@ucscmsa.com>";

export function emailConfigFromEnv(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, from: env.EMAIL_FROM?.trim() || DEFAULT_FROM };
}

export async function sendEmail(
  email: OutgoingEmail,
  config: EmailConfig | null = emailConfigFromEnv(),
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  if (!config) return { sent: false, reason: "off" };
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        headers: {
          "List-Unsubscribe": `<${email.oneClickUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { sent: false, reason: "failed", detail: `${res.status} ${(await res.text()).slice(0, 200)}` };
    const body = (await res.json()) as { id?: string };
    return { sent: true, id: body.id ?? "" };
  } catch (err) {
    return { sent: false, reason: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
}
