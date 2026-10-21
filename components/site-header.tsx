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
  { href: "/admin/plan", label: "Planning" },
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

export function SiteHeader({ variant = "public" }: { variant?: Variant } = {}) {
  const pathname = usePathname();
  const items = variant === "admin" ? ADMIN_NAV : PUBLIC_NAV;
  const activeHref = pickActiveHref(pathname, items);
  // One public link fits beside the logo at any width; only the admin nav
  // collapses into a menu on phones.
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
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <WiggleIcon size={28} alt="" />
          <span className="font-display text-base leading-none">
            MSA at UCSC
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className={`items-center gap-3 text-sm text-ink/70 ${collapsible ? "hidden sm:flex" : "flex"}`}
        >
          {items.map((item) => {
            const isActive = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex min-h-11 items-center px-1 ${
                  isActive
                    ? "text-ink underline decoration-burgundy decoration-2 underline-offset-[6px]"
                    : "transition-colors hover:text-ink"
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
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-ink/70 transition-colors hover:text-ink sm:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}
      </div>

      {collapsible && open && (
        <nav
          id="site-header-mobile-menu"
          aria-label="Primary"
          className="border-t border-ink/10 bg-paper/95 backdrop-blur sm:hidden"
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
