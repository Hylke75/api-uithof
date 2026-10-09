import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { leesEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Alleen-lezende diagnose van de CASH-API: administraties, dagboeken, grootboekrekeningen en
 * (optioneel) gezochte relaties in de ingestelde administratie. Beveiligd met CRON_SECRET.
 */

const HEADERS = { Accept: "*/*", "Content-Type": "application/json;charset=UTF-8", "Cache-Control": "no-cache", "Sec-Fetch-Mode": "cors" };
const rijen = (x: unknown): Record<string, string>[] => (x == null ? [] : Array.isArray(x) ? x : Object.values(x as object));

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const base = (leesEnv("CASH_BASE_URL") ?? "https://www.cashweb.nl/api/4.0").replace(/\/+$/, "");
  const key = leesEnv("CASH_API_KEY") ?? "";
  const admin = leesEnv("CASH_ADMINISTRATIE") ?? "";
  const relaties = (req.nextUrl.searchParams.get("relaties") ?? "").split(",").filter(Boolean);

  async function get(pad: string) {
    try {
      const res = await fetch(`${base}${pad}`, { headers: { ...HEADERS, Authorization: key }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
      const tekst = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(tekst);
      } catch {
        /* geen JSON */
      }
      return { http: res.status, json, tekst: json ? undefined : tekst.slice(0, 300) };
    } catch (e) {
      return { http: 0, json: null, tekst: e instanceof Error ? e.message : String(e) };
    }
  }

  const q = `?admin=${encodeURIComponent(admin)}`;
  const [adm, dag, gb, rel] = await Promise.all([get("/administrations"), get(`/get/index/0901${q}`), get(`/get/index/0201${q}`), get(`/get/index/0101${q}`)]);
  const admJson = adm.json as { Dir?: { Name?: string; Adms?: { Adm?: unknown } } } | null;
  const relRijen = rijen((rel.json as { R0101?: unknown } | null)?.R0101);

  return NextResponse.json({
    admin,
    administraties: { http: adm.http, relatie: admJson?.Dir?.Name, lijst: rijen(admJson?.Dir?.Adms?.Adm).map((a) => ({ code: a.Code, naam: a.Name, readOnly: a.ReadOnly })), fout: adm.tekst },
    dagboeken: { http: dag.http, lijst: rijen((dag.json as { R0901?: unknown } | null)?.R0901), fout: dag.tekst },
    grootboek: { http: gb.http, lijst: rijen((gb.json as { R0201?: unknown } | null)?.R0201).map((r) => ({ rek: r.F0201, oms: r.F0203, soort: r.F0204, ob: r.F0242 })), fout: gb.tekst },
    relaties: {
      http: rel.http,
      aantal: relRijen.length,
      velden: relRijen[0] ? Object.keys(relRijen[0]) : [],
      voorbeeld: relRijen.slice(0, 3).map((r) => ({ nr: r.F0101, naam: r.F0103 })),
      gezocht: relaties.map((nr) => ({ nr, gevonden: relRijen.some((r) => Number(r.F0101) === Number(nr)) })),
      fout: rel.tekst,
    },
  });
}
