import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { redigeer } from "@/lib/dashboard/resultaat";
import { leesEnv } from "@/lib/env";
import { startTestboeking } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cron/testboeking?batch=94&factuur=1989
 * Boekt één SEM-factuur (of een hele batch) echt in de CASH-testadministratie "demo".
 * Beveiligd met CRON_SECRET; weigert elke andere administratie.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const batch = Number(req.nextUrl.searchParams.get("batch"));
  const factuur = req.nextUrl.searchParams.get("factuur");
  if (!Number.isInteger(batch) || batch <= 0) return NextResponse.json({ error: "batch ontbreekt" }, { status: 400 });

  try {
    const r = await startTestboeking(batch, factuur ? Number(factuur) : undefined);
    return NextResponse.json(r, { status: r.status === "failed" ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ status: "failed", error: redigeer(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
}
