import { request as httpsRequest } from "node:https";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { leesEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
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
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ?omgeving=demo test dezelfde sleutel tegen de SEM-testomgeving (om te zien bij welke omgeving hij hoort).
  const base =
    req.nextUrl.searchParams.get("omgeving") === "demo"
      ? "https://apidemo.smarteventmanager.com"
      : (leesEnv("SEM_BASE_URL") ?? "").replace(/\/+$/, "").replace(/\/api$/i, "");
  const key = leesEnv("SEM_API_KEY") ?? "";
  const van = req.nextUrl.searchParams.get("van") ?? "2000-01-01";
  const batch = req.nextUrl.searchParams.get("batch");
  const alles = req.nextUrl.searchParams.get("alles") === "1";

  // ?methode=get: zoals het voorbeeld in de SEM-documentatie, GET met de filter in de body.
  // fetch() staat geen body bij GET toe, daarom via node:https.
  const methode = req.nextUrl.searchParams.get("methode") === "get" ? "GET" : "POST";
  function getMetBody(url: string, body: string): Promise<{ status: number; text: () => Promise<string> }> {
    return new Promise((resolve, reject) => {
      const r = httpsRequest(
        url,
        { method: "GET", headers: { Accept: "application/json", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ApiKey: key }, timeout: 30_000 },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => resolve({ status: res.statusCode ?? 0, text: async () => data }));
        },
      );
      r.on("error", reject);
      r.on("timeout", () => r.destroy(new Error("timeout")));
      r.end(body);
    });
  }

  async function post(pad: string, body: unknown) {
    const start = Date.now();
    try {
      const res =
        methode === "GET"
          ? await getMetBody(`${base}/api/${pad}`, JSON.stringify(body))
          : await fetch(`${base}/api/${pad}`, {
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
      return { pad, methode, verzoek: body, http: res.status, ms: Date.now() - start, antwoord: json ? samenvatting(json, alles) : tekst.slice(0, 500) };
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
