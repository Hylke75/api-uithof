import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { env } from "@/lib/env";
import { startSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Aangeroepen door Vercel Cron (zie vercel.json). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env().CRON_SECRET}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resultaat = await startSync("cron");
  return NextResponse.json(resultaat, { status: resultaat.status === "failed" ? 500 : 200 });
}
