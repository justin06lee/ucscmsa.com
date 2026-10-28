import { db } from "@/lib/db/client";
import { checkMuteToken } from "@/lib/mute-token";
import { setMuted } from "@/lib/step-owners";

// Mutes step emails. Mail apps POST here from their own Unsubscribe button
// (List-Unsubscribe-Post, RFC 8058); the /unsubscribe page's button posts here too.
export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const userId = q.get("u") ?? "";
  const token = q.get("t") ?? "";
  const secret = process.env.AUTH_SECRET;
  if (!secret || !userId || !checkMuteToken(userId, token, secret)) {
    return new Response("That link doesn't work.", { status: 400 });
  }
  await setMuted(db, userId, true);
  const form = await req.formData().catch(() => null);
  if (form?.get("from") === "page") {
    return Response.redirect(new URL("/unsubscribe?done=1", req.url), 303);
  }
  return new Response("Step emails are off.", { status: 200 });
}
