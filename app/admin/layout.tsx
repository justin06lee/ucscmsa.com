import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="max-w-5xl mx-auto px-6 py-10 w-full flex-1">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-medium">Admin</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin" className="hover:text-burgundy">Events</Link>
          <Link href="/admin/admins" className="hover:text-burgundy">Admins</Link>
          <Link href="/admin/nominations" className="hover:text-burgundy">Nominations</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
