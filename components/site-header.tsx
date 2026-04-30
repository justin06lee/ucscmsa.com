import Link from "next/link";
import { WiggleIcon } from "@/components/logo/wiggle-icon";

type Variant = "public" | "admin";

export function SiteHeader({ variant = "public" }: { variant?: Variant } = {}) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <WiggleIcon size={28} alt="" />
          <span className="font-display text-base leading-none">
            MSA at UCSC
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-ink/70">
          {variant === "admin" ? (
            <>
              <Link href="/admin" className="hover:text-ink transition-colors">
                Events
              </Link>
              <Link
                href="/admin/admins"
                className="hover:text-ink transition-colors"
              >
                Admins
              </Link>
              <Link
                href="/admin/nominations"
                className="hover:text-ink transition-colors"
              >
                Nominations
              </Link>
              <Link
                href="/calendar"
                className="hover:text-ink transition-colors"
              >
                Calendar
              </Link>
            </>
          ) : (
            <Link href="/calendar" className="hover:text-ink transition-colors">
              Calendar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
