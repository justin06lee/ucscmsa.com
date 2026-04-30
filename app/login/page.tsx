import type { Metadata } from "next";
import Link from "next/link";
import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { WiggleIcon } from "@/components/logo/wiggle-icon";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

type SP = { callbackUrl?: string; error?: string };

const errorMessages: Record<string, string> = {
  AccessDenied: "Only @ucsc.edu Google accounts can sign in.",
  Configuration: "Authentication is misconfigured. Try again later.",
  Verification: "Your sign-in link is invalid or has expired.",
  OAuthSignin: "Could not reach Google. Try again.",
  OAuthCallback: "Google sign-in failed. Try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const callbackUrl = sp.callbackUrl ?? "/";

  if (session?.user) redirect(callbackUrl);

  const errorMessage = sp.error
    ? errorMessages[sp.error] ?? "Something went wrong. Please try again."
    : null;

  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6 py-20">
      <WiggleIcon size={96} alt="" />
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-4xl leading-none">Sign in</h1>
        <p className="text-sm text-dim">
          Admin access requires a{" "}
          <span className="text-ink">@ucsc.edu</span> Google account.
        </p>
      </div>
      {errorMessage ? (
        <p
          role="alert"
          className="w-full rounded-md border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-center text-sm text-burgundy"
        >
          {errorMessage}
        </p>
      ) : null}
      <form action={signInWithGoogle} className="w-full">
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="w-full !border-ink !px-7 !py-3 hover:!bg-ink hover:!text-paper"
        >
          <GoogleMark />
          Continue with Google
        </Button>
      </form>
      <Link
        href="/"
        className="text-sm text-dim transition-colors hover:text-ink"
      >
        &larr; Back to home
      </Link>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 18 18"
      width={16}
      height={16}
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.257h2.908c1.702-1.567 2.684-3.875 2.684-6.614z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
