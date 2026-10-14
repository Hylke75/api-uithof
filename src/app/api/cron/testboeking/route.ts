import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { redigeer } from "@/lib/dashboard/resultaat";
import { leesEnv } from "@/lib/env";
import { herstelTestboeking, startTestboeking } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cron/testboeking?batch=94&factuur=1989
 * Met &dagboek=VERK: in een ander dagboek van de testadministratie boeken.
 * Met &proef=1: alleen omzetten en tonen, niets naar CASH.
 * Met &herstel=1: eerst de oude (mislukte) boeking in CASH tegenboeken, dan opnieuw boeken.
 * Boekt één SEM-factuur (of een hele batch) echt in de CASH-testadministratie "demo".
 * Beveiligd met CRON_SECRET; weigert elke andere administratie.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const batch = Number(req.nextUrl.searchParams.get("batch"));
  const factuur = req.nextUrl.searchParams.get("factuur");
  if (!Number.isInteger(batch) || batch <= 0) return NextResponse.json({ error: "batch ontbreekt" }, { status: 400 });

  const dagboek = req.nextUrl.searchParams.get("dagboek")?.trim().toUpperCase() || undefined;
  if (dagboek && !/^[A-Z0-9]{1,6}$/.test(dagboek)) return NextResponse.json({ error: "ongeldig dagboek" }, { status: 400 });
  const invoiceId = factuur ? Number(factuur) : undefined;

  try {
    if (req.nextUrl.searchParams.get("herstel") === "1") {
      if (invoiceId == null) return NextResponse.json({ error: "factuur ontbreekt" }, { status: 400 });
      const h = await herstelTestboeking(batch, invoiceId, dagboek);
      return NextResponse.json(h, { status: h.nieuw.status === "failed" ? 500 : 200 });
    }
    const r = await startTestboeking(batch, { invoiceId, proef: req.nextUrl.searchParams.get("proef") === "1", dagboek });
    return NextResponse.json(r, { status: r.status === "failed" ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ status: "failed", error: redigeer(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
}
