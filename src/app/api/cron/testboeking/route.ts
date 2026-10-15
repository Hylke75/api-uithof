import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { redigeer } from "@/lib/dashboard/resultaat";
import { startTestboeking } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Alleen voor administratie "demo"; weigert in productie.
 * POST /api/cron/testboeking?batch=1005[&factuur=21396][&proef=1][&dagboek=VERK]
 * Boekt één SEM-factuur (of een hele batch) echt in de CASH-testadministratie "demo".
 * &proef=1: alleen omzetten en tonen, niets naar CASH. &dagboek=: ander dagboek in demo.
 */
export async function POST(req: NextRequest) {
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;

  const batch = Number(req.nextUrl.searchParams.get("batch"));
  const factuur = req.nextUrl.searchParams.get("factuur");
  if (!Number.isInteger(batch) || batch <= 0) return NextResponse.json({ error: "batch ontbreekt" }, { status: 400 });

  const dagboek = req.nextUrl.searchParams.get("dagboek")?.trim().toUpperCase() || undefined;
  if (dagboek && !/^[A-Z0-9]{1,6}$/.test(dagboek)) return NextResponse.json({ error: "ongeldig dagboek" }, { status: 400 });
  if (factuur && !/^\d{1,9}$/.test(factuur)) return NextResponse.json({ error: "factuur moet een nummer zijn" }, { status: 400 });
  const invoiceId = factuur ? Number(factuur) : undefined;

  try {
    const r = await startTestboeking(batch, { invoiceId, proef: req.nextUrl.searchParams.get("proef") === "1", dagboek });
    return NextResponse.json(r, { status: r.status === "failed" ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ status: "failed", error: redigeer(e instanceof Error ? e.message : String(e)) }, { status: 400 });
  }
}
