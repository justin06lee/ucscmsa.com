import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function LeadTimesPage() {
  await requireAdmin();
  redirect("/admin/playbook");
}
