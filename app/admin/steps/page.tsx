import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireAdmin } from "@/lib/auth";
import { isMuted, listMySteps } from "@/lib/step-owners";
import { toLocalYmd } from "@/lib/time";
import { MySteps } from "./my-steps";

export const metadata: Metadata = { title: "My steps" };

export default async function MyStepsPage() {
  const session = await requireAdmin();
  const userId = session.user.id;
  const [steps, muted] = userId ? await Promise.all([listMySteps(db, userId), isMuted(db, userId)]) : [[], false];
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl">My steps</h1>
      <p className="mb-6 mt-1 text-dim">The steps board members gave you, soonest first.</p>
      <MySteps steps={steps} today={toLocalYmd(new Date())} emailsOn={!muted} />
    </div>
  );
}
