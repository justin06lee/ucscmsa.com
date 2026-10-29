"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { WiggleIcon } from "@/components/logo/wiggle-icon";

type Variant = "public" | "admin";

type NavItem = { href: string; label: string };

const PUBLIC_NAV: NavItem[] = [{ href: "/calendar", label: "Calendar" }];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Events" },
  { href: "/admin/plan", label: "Timeline" },
  { href: "/admin/steps", label: "My steps" },
  { href: "/admin/playbook", label: "Playbook" },
  { href: "/admin/admins", label: "Admins" },
  { href: "/admin/nominations", label: "Nominations" },
  { href: "/calendar", label: "Calendar" },
];

/**
 * Picks the active link by longest-matching prefix so that e.g. /admin/admins
 * activates "Admins" (not "Events" at /admin). An entry matches when the
 * pathname equals its href or starts with `${href}/`.
 */
function pickActiveHref(pathname: string | null, items: NavItem[]): string | null {
  if (!pathname) return null;
  let best: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

/**
 * The top bar: no background and no border, only the logo and the links, so
 * it sits on the page (Justin's ask). It scrolls away with the page rather than
 * sticking, since a see-through bar would run over the text under it. The
 * landing passes brand={false}: its own big logo is right below.
 */
export function SiteHeader({
  variant = "public",
  brand = true,
}: { variant?: Variant; brand?: boolean } = {}) {
  const pathname = usePathname();
  const items = variant === "admin" ? ADMIN_NAV : PUBLIC_NAV;
  const activeHref = pickActiveHref(pathname, items);
  // One public link fits beside the logo at any width; only the admin nav
  // collapses into a menu, below md: its six links crowd the logo at 640px.
  const collapsible = items.length > 1;
  const [open, setOpen] = useState(false);
  // Reset on route change via the React 19 "compare during render" pattern,
  // avoiding a useEffect that would trigger react-hooks/set-state-in-effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="relative z-40">
      <div
        className={`mx-auto flex h-14 max-w-6xl items-center px-6 ${brand ? "justify-between" : "justify-end"}`}
      >
        {brand ? (
          <Link
            href="/"
            className="flex min-h-11 items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <WiggleIcon size={28} alt="" />
            <span className="font-display text-base leading-none">
              MSA at UCSC
            </span>
          </Link>
        ) : null}

        <nav
          aria-label="Primary"
          className={`-mr-3 items-center gap-1 text-sm text-ink/70 ${collapsible ? "hidden md:flex" : "flex"}`}
        >
          {items.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-3 transition-colors hover:bg-ink/5 ${
                  isActive
                    ? "text-ink underline decoration-burgundy decoration-2 underline-offset-[6px]"
                    : "hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {collapsible && (
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-header-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink/70 transition-colors hover:text-ink md:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}
      </div>

      {collapsible && open && (
        <nav
          id="site-header-mobile-menu"
          aria-label="Primary"
          className="absolute inset-x-0 top-full border-y border-ink/10 bg-paper shadow-sm md:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-6 py-2 text-base">
            {items.map((item) => {
              const isActive = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={
                      isActive
                        ? "flex min-h-11 items-center rounded-md text-ink underline decoration-burgundy decoration-2 underline-offset-[6px]"
                        : "flex min-h-11 items-center rounded-md text-ink/70 transition-colors hover:text-ink"
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
