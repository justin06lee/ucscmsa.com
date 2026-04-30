import { requireAdmin } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <SiteHeader variant="admin" />
      <div className="max-w-5xl mx-auto px-6 py-10 w-full flex-1">
        {children}
      </div>
    </>
  );
}
