import { cache } from "react";
import { auth } from "@/auth";

// One session lookup per render: the admin layout and its page both check, and
// each lookup is two database round trips (the session, then the admins row).
// React scopes the cache to a single server request, so nothing is shared
// between users; outside a render (server actions) it simply calls through.
const currentSession = cache(() => auth());

export async function getSession() {
  return await currentSession();
}

export async function requireAdmin() {
  const session = await currentSession();
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
