import { auth } from "@/auth";

export async function getSession() {
  return await auth();
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    throw new Error("unauthorized");
  }
  return session;
}

export async function requireAdminId(): Promise<number> {
  const session = await requireAdmin();
  if (session.user.adminId == null) throw new Error("missing_admin_id");
  return session.user.adminId;
}
