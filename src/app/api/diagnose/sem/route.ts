import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { leesEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Alleen-lezende diagnose van de SEM-API: laat de opbouw van de antwoorden zien (sleutels,
 * aantallen, eerste/laatste batch) zonder iets op te slaan. Beveiligd met CRON_SECRET.
 */

function samenvatting(body: unknown) {
  if (body == null || typeof body !== "object") return { type: typeof body, waarde: String(body).slice(0, 300) };
  const o = body as Record<string, unknown>;
  const lijsten = Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => {
        const arr = v as Record<string, unknown>[];
        return [k, { aantal: arr.length, velden: arr[0] ? Object.keys(arr[0]) : [], eerste: arr[0] ?? null, laatste: arr.at(-1) ?? null }];
      }),
  );
  return { sleutels: Object.keys(o), lijsten, overig: Object.fromEntries(Object.entries(o).filter(([, v]) => !Array.isArray(v))) };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const base = (leesEnv("SEM_BASE_URL") ?? "").replace(/\/+$/, "").replace(/\/api$/i, "");
  const key = leesEnv("SEM_API_KEY") ?? "";
  const van = req.nextUrl.searchParams.get("van") ?? "2000-01-01";
  const batch = req.nextUrl.searchParams.get("batch");

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
      return { pad, verzoek: body, http: res.status, ms: Date.now() - start, antwoord: json ? samenvatting(json) : tekst.slice(0, 500) };
    } catch (e) {
      return { pad, verzoek: body, fout: e instanceof Error ? e.message : String(e) };
    }
  }

  const proeven = [
    post("JournalEntryBatches/GetJournalEntryBatches", { JournalEntryBatchFilter: { FromModifiedAt: `${van}T00:00` } }),
    post("JournalEntryBatches/GetJournalEntryBatches", { JournalEntryBatchFilter: {} }),
  ];
  if (batch) {
    proeven.push(post("JournalEntries/GetJournalEntries", { JournalEntryFilter: { BatchNumber: batch } }));
    proeven.push(post("Invoices/GetInvoices", { InvoiceFilter: { BatchNumbers: [Number(batch)] }, InvoiceLoadOptions: { DoLoadInvoiceLines: false } }));
  }
  return NextResponse.json({ semUrl: base, van, resultaten: await Promise.all(proeven) });
}
