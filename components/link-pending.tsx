"use client";

import { useLinkStatus } from "next/link";

/**
 * Put inside a <Link> (which needs `relative`): a thin bar along its bottom
 * edge while the page it opens is loading, for links to pages that aren't
 * prefetched. Nothing shows when the page is already there.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" data-pending={pending ? "" : undefined} className="link-pending" />;
}
