"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isUnauthorized = error.message === "unauthorized";

  return (
    <div className="max-w-xl mx-auto px-6 py-16 text-center">
      <h1 className="text-2xl font-medium mb-4">
        {isUnauthorized ? "Admin access required" : "Something went wrong"}
      </h1>
      <p className="text-dim mb-6">
        {isUnauthorized
          ? "Your account isn't an admin. If this is unexpected, contact a current admin."
          : "An unexpected error occurred loading this admin page."}
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/"
          className="px-4 py-2 rounded-full border border-ink hover:bg-ink hover:text-paper"
        >
          Back to site
        </Link>
        {!isUnauthorized && (
          <Button onClick={reset}>Try again</Button>
        )}
      </div>
    </div>
  );
}
