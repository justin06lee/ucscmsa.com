"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { SITE_EMAIL, SITE_INSTAGRAM_URL, SITE_WHATSAPP_JOIN_URL } from "@/lib/site";

const pill =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm text-ink/80 transition-colors hover:border-ink/40 hover:text-ink";

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.7-1.2 2.2 2.2 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

/** Copies text, with the old execCommand path for browsers without the API. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * The MSA's ways in, right under the landing's logo: Instagram, the WhatsApp
 * sign-up form (the group is joined through a form, not an open link), and a
 * button that copies the email address.
 */
export function SocialLinks({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <ul aria-label="Find us" className={`flex flex-wrap items-center justify-center gap-2.5 ${className}`}>
      <li>
        <a href={SITE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={pill}>
          <InstagramGlyph />
          Instagram
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>
      <li>
        <a href={SITE_WHATSAPP_JOIN_URL} target="_blank" rel="noopener noreferrer" className={pill}>
          <WhatsAppGlyph />
          WhatsApp
          <span className="sr-only"> sign-up form (opens in a new tab)</span>
        </a>
      </li>
      <li>
        <button
          type="button"
          onClick={async () => setCopied((await copyText(SITE_EMAIL)) ? "yes" : "failed")}
          className={pill}
        >
          {copied === "yes" ? (
            <Check size={16} aria-hidden="true" className="text-burgundy" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
          {/* Both labels share one cell, so the pill keeps its width. */}
          <span className="grid">
            <span className={`col-start-1 row-start-1 ${copied === "yes" ? "invisible" : ""}`}>{SITE_EMAIL}</span>
            <span aria-hidden="true" className={`col-start-1 row-start-1 text-center ${copied === "yes" ? "" : "invisible"}`}>
              Copied
            </span>
          </span>
          <span className="sr-only">{copied ? "" : " (copy the email address)"}</span>
        </button>
        <span role="status" className="sr-only">
          {copied === "yes" ? `Copied ${SITE_EMAIL}` : copied === "failed" ? "Could not copy. The address is " + SITE_EMAIL : ""}
        </span>
      </li>
    </ul>
  );
}
