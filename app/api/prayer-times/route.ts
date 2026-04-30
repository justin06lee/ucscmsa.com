import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getPrayerTimes } from "@/lib/aladhan";

export const revalidate = 3600;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date query param required, format YYYY-MM-DD" },
      { status: 400 }
    );
  }
  const times = await getPrayerTimes(date, db);
  return NextResponse.json({ date, times });
}
