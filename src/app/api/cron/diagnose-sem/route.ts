import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { redigeer } from "@/lib/dashboard/resultaat";
import { leesEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Alleen-lezende diagnose van de SEM-API: laat de opbouw van de antwoorden zien (sleutels,
 * aantallen, eerste/laatste batch) zonder iets op te slaan. Beveiligd met CRON_SECRET.
 */

function samenvatting(body: unknown, alles = false) {
  if (body == null || typeof body !== "object") return { type: typeof body, waarde: String(body).slice(0, 300) };
  const o = body as Record<string, unknown>;
  const lijsten = Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => {
        const arr = v as Record<string, unknown>[];
        return [k, { aantal: arr.length, velden: arr[0] ? Object.keys(arr[0]) : [], eerste: arr[0] ?? null, laatste: arr.at(-1) ?? null, ...(alles ? { items: arr.slice(0, 50) } : {}) }];
      }),
  );
  return { sleutels: Object.keys(o), lijsten, overig: Object.fromEntries(Object.entries(o).filter(([, v]) => !Array.isArray(v))) };
}

export async function GET(req: NextRequest) {
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;

  const base = (leesEnv("SEM_BASE_URL") ?? "").replace(/\/+$/, "").replace(/\/api$/i, "");
  const key = leesEnv("SEM_API_KEY") ?? "";
  const van = req.nextUrl.searchParams.get("van") ?? "2000-01-01";
  const batch = req.nextUrl.searchParams.get("batch");
  const alles = req.nextUrl.searchParams.get("alles") === "1";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(van)) return NextResponse.json({ error: "van moet JJJJ-MM-DD zijn" }, { status: 400 });
  if (batch != null && !/^\d{1,9}$/.test(batch)) return NextResponse.json({ error: "batch moet een nummer zijn" }, { status: 400 });

  async function post(pad: string, body: unknown) {
    const start = Date.now();
    try {
      const res = await fetch(`${base}/api/${pad}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", ApiKey: key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const tekst = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(tekst);
      } catch {
        /* geen JSON */
      }
      return { pad, verzoek: body, http: res.status, ms: Date.now() - start, antwoord: json ? samenvatting(json, alles) : redigeer(tekst.slice(0, 300)) };
    } catch (e) {
      return { pad, verzoek: body, fout: redigeer(e instanceof Error ? e.message : String(e)) };
    }
  }

  // ?relatie=<RelationID>: één klant uit SEM ophalen (alleen lezen), om relaties in CASH aan te maken.
  const relatie = req.nextUrl.searchParams.get("relatie");
  if (relatie != null) {
    if (!/^\d{1,9}$/.test(relatie)) return NextResponse.json({ error: "relatie moet een nummer zijn" }, { status: 400 });
    const r = await post("Relations/GetRelation", { RelationID: Number(relatie) });
    return NextResponse.json({ semUrl: base, resultaten: [r] });
  }

  const proeven = [post("JournalEntryBatches/GetJournalEntryBatches", { JournalEntryBatchFilter: { FromModifiedAt: `${van}T00:00` } })];
  if (batch) {
    proeven.push(post("JournalEntries/GetJournalEntries", { JournalEntryFilter: { BatchNumber: batch } }));
    proeven.push(post("Invoices/GetInvoices", { InvoiceFilter: { BatchNumbers: [Number(batch)] }, InvoiceLoadOptions: { DoLoadInvoiceLines: false } }));
  }
  return NextResponse.json({ semUrl: base, van, resultaten: await Promise.all(proeven) });
}
