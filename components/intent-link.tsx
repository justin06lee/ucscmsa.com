"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A <Link> for long lists: it prefetches nothing while it sits on the page and
 * starts when the visitor shows intent (hover, keyboard focus, or the first
 * touch on a phone). A list of fifty rows then costs no requests up front, and
 * the row about to be opened is usually ready by the time the click lands.
 * Use plain <Link> for the main nav and single links.
 */
export function IntentLink({ onMouseEnter, onFocus, onTouchStart, ...props }: Omit<ComponentProps<typeof Link>, "prefetch">) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
    />
  );
}
