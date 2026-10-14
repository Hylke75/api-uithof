import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { cashDatum, createCashClient, naarRecords, type CashBoeking } from "@/lib/cash/client";
import { env, leesEnv } from "@/lib/env";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/cron/vergelijk?batch=1004[&dagboek=VERKS]
 * Legt per factuur de omzetting van de koppeling (cash_payload) naast wat er al in CASH staat
 * (zelfde boekstuknummer; standaard het dagboek uit de omzetting), opgeteld per grootboekrekening.
 * Alleen lezen.
 */
const centen = (s: string) => Math.round(Number(String(s).replace(",", ".")) * 100);

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const batch = Number(req.nextUrl.searchParams.get("batch"));
  if (!Number.isInteger(batch) || batch <= 0) return NextResponse.json({ error: "batch ontbreekt" }, { status: 400 });
  const dagboekVast = req.nextUrl.searchParams.get("dagboek")?.trim().toUpperCase();

  const { data, error } = await db()
    .from("sem_facturen")
    .select("factuurnummer, status, cash_payload")
    .eq("sem_batch_number", batch)
    .order("factuurnummer");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const e = env();
  const cash = createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY });
  const resultaten = [];
  for (const f of data ?? []) {
    const b = f.cash_payload as CashBoeking | null;
    if (!b) {
      resultaten.push({ factuur: f.factuurnummer, status: f.status, uitkomst: "geen omzetting" });
      continue;
    }
    const koppeling = new Map<string, number>();
    for (const r of naarRecords(b)) koppeling.set(r.F0201, (koppeling.get(r.F0201) ?? 0) + centen(r.F0307));

    // Boekperiode in CASH kan afwijken van de factuurdatum: zoek een maand ervoor tot een maand erna.
    const maand = (delta: number) => {
      const d = new Date(`${b.boekdatum.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + delta);
      return cashDatum(d.toISOString().slice(0, 10)).slice(0, 4);
    };
    const inCash = await cash.mutaties(b.administratie, maand(-1), dagboekVast || b.dagboek.toUpperCase(), b.factuurnummer, maand(1));
    const handmatig = new Map<string, number>();
    for (const m of inCash) handmatig.set(m.F0201, (handmatig.get(m.F0201) ?? 0) + centen(m.F0307));

    const rekeningen = [...new Set([...koppeling.keys(), ...handmatig.keys()])].sort();
    const verschillen = rekeningen
      .map((rek) => ({ rek, koppeling: (koppeling.get(rek) ?? 0) / 100, cash: (handmatig.get(rek) ?? 0) / 100 }))
      .filter((v) => v.koppeling !== v.cash);
    resultaten.push({
      factuur: f.factuurnummer,
      status: f.status,
      inCash: inCash.length > 0,
      datumCash: inCash[0]?.F0302 ?? null,
      datumKoppeling: b.boekdatum,
      uitkomst: inCash.length === 0 ? "niet in CASH" : verschillen.length === 0 ? "gelijk" : "verschil",
      verschillen,
    });
  }
  return NextResponse.json({ batch, aantal: resultaten.length, gelijk: resultaten.filter((r) => r.uitkomst === "gelijk").length, resultaten });
}
