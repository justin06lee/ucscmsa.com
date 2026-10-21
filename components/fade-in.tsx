import type { ReactNode } from "react";

// CSS-only entrance fade (.fade-in in globals.css). The JS version rendered
// opacity:0 into the server HTML and only revealed content after hydration —
// and never for prefers-reduced-motion users, whose client render couldn't
// patch the server's inline style. A CSS animation runs without JS and the
// reduced-motion media query switches it off.
export function FadeIn({ children }: { children: ReactNode }) {
  return <div className="fade-in">{children}</div>;
}
