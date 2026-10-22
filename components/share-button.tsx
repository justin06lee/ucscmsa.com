"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

/**
 * Shares a page: the phone's share sheet where there is one (Web Share API),
 * else copies the link and says so quietly.
 */
export function ShareButton({ title, url, className = "" }: { title: string; url: string; className?: string }) {
  const [status, setStatus] = useState("");

  async function share() {
    const href = new URL(url, window.location.origin).toString();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: href });
        return;
      } catch (err) {
        // Closing the share sheet isn't an error to report.
        if ((err as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(href);
      setStatus("Link copied");
    } catch {
      setStatus(`Copy this link: ${href}`);
    }
    window.setTimeout(() => setStatus(""), 4000);
  }

  return (
    <>
      <button type="button" onClick={share} className={className}>
        <Share2 size={15} aria-hidden="true" />
        Share
      </button>
      <span role="status" className="basis-full text-xs text-dim empty:hidden">
        {status}
      </span>
    </>
  );
}
