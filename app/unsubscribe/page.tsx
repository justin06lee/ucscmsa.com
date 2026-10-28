import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { checkMuteToken } from "@/lib/mute-token";
import { SiteHeader } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Step emails",
  robots: { index: false, follow: false },
};

// Where the "Stop them" link in step emails lands. It asks first, so a mail
// scanner opening the link can't mute anyone.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; done?: string }>;
}) {
  const { u = "", t = "", done } = await searchParams;
  const secret = process.env.AUTH_SECRET;
  const valid = Boolean(secret && u && checkMuteToken(u, t, secret));
  const [person] = valid ? await db.select({ email: users.email }).from(users).where(eq(users.id, u)) : [];

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-md flex-1 px-6 py-10">
        <h1 className="text-3xl leading-tight">Step emails</h1>
        {done ? (
          <p className="mt-3">
            Done. You won&rsquo;t get step emails any more. You can turn them back on from{" "}
            <Link href="/admin/steps" className="text-burgundy underline decoration-burgundy/30 underline-offset-4">
              My steps
            </Link>
            .
          </p>
        ) : person ? (
          <form method="post" action={`/api/notify/unsubscribe?${new URLSearchParams({ u, t })}`} className="mt-3">
            <input type="hidden" name="from" value="page" />
            <p>
              Stop the reminder emails about your MSA steps for <span className="font-medium">{person.email}</span>?
            </p>
            <button type="submit" className={`${buttonClasses("primary", "md")} mt-4 min-h-11`}>
              Stop step emails
            </button>
          </form>
        ) : (
          <p className="mt-3">
            This link doesn&rsquo;t work. Sign in and turn emails off from{" "}
            <Link href="/admin/steps" className="text-burgundy underline decoration-burgundy/30 underline-offset-4">
              My steps
            </Link>
            .
          </p>
        )}
      </main>
    </>
  );
}
