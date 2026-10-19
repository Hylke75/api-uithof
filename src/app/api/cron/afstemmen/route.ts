import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { createCashClient, type CashBoeking } from "@/lib/cash/client";
import { redigeer } from "@/lib/dashboard/resultaat";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/cron/afstemmen?facturen=823515,823516[&proef=1]
 * Zet de status van facturen gelijk aan wat er werkelijk in CASH (de ingestelde administratie) staat:
 * - boekstuk aanwezig: `geboekt` (bijv. met de hand geboekt);
 * - boekstuk afwezig: `fout`, zodat de volgende sync het opnieuw boekt.
 * Dubbel boeken kan zo niet: alleen wat aantoonbaar ontbreekt, wordt opnieuw aangeboden.
 * &proef=1: alleen tonen, niets wijzigen.
 */
export async function POST(req: NextRequest) {
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;

  const sp = req.nextUrl.searchParams;
  const proef = sp.get("proef") === "1";
  const nummers = (sp.get("facturen") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!nummers.length || nummers.length > 100 || nummers.some((n) => !/^\d{1,6}$/.test(n))) {
    return NextResponse.json({ error: "facturen: max. 100 factuurnummers, komma-gescheiden" }, { status: 400 });
  }

  const e = env();
  const cash = createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY });
  const sb = db();
  try {
    await cash.controleerAdministratie(e.CASH_ADMINISTRATIE);
    const { data, error } = await sb.from("sem_facturen").select("sem_factuur_id, factuurnummer, status, cash_payload").in("factuurnummer", nummers);
    if (error) throw new Error(error.message);

    const resultaten = [];
    for (const f of data ?? []) {
      const boeking = f.cash_payload as CashBoeking | null;
      if (!boeking || f.status === "proef") {
        resultaten.push({ factuur: f.factuurnummer, status: f.status, actie: "overgeslagen (geen live boeking)" });
        continue;
      }
      const inCash = await cash.boekstukBestaat({ ...boeking, administratie: e.CASH_ADMINISTRATIE });
      const patch = inCash
        ? { status: "geboekt", cash_boeking_id: `${boeking.dagboek}/${f.factuurnummer}`, foutmelding: `Staat in CASH (${e.CASH_ADMINISTRATIE}); vastgesteld bij afstemmen.` }
        : { status: "fout", cash_boeking_id: null, foutmelding: `Niet gevonden in CASH (${e.CASH_ADMINISTRATIE}); wordt bij de volgende sync opnieuw geboekt.` };
      if (!proef && patch.status !== f.status) {
        const { error: fout } = await sb.from("sem_facturen").update({ ...patch, updated_at: new Date().toISOString() }).eq("sem_factuur_id", f.sem_factuur_id);
        if (fout) throw new Error(fout.message);
      }
      resultaten.push({ factuur: f.factuurnummer, was: f.status, inCash, wordt: patch.status });
    }
    return NextResponse.json({ administratie: e.CASH_ADMINISTRATIE, proef, onbekend: nummers.filter((n) => !data?.some((f) => f.factuurnummer === n)), resultaten });
  } catch (err) {
    return NextResponse.json({ error: redigeer(err instanceof Error ? err.message : String(err)) }, { status: 500 });
  }
}
