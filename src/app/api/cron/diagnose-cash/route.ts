import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { redigeer } from "@/lib/dashboard/resultaat";
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
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;

  const base = (leesEnv("CASH_BASE_URL") ?? "https://www.cashweb.nl/api/4.0").replace(/\/+$/, "");
  const key = leesEnv("CASH_API_KEY") ?? "";
  // Alleen lezen: ?admin= kijkt in een andere administratie (bijv. spo1 vóór het live gaan).
  const adminParam = req.nextUrl.searchParams.get("admin");
  if (adminParam && !/^[a-z0-9]{1,8}$/i.test(adminParam)) return NextResponse.json({ error: "ongeldige administratie" }, { status: 400 });
  const admin = adminParam || (leesEnv("CASH_ADMINISTRATIE") ?? "");
  const relaties = (req.nextUrl.searchParams.get("relaties") ?? "").split(",").filter(Boolean);
  // Optioneel: grootboekmutaties (record 301) van een periode JJPP|JJPP, gefilterd op dagboek/stuknummer.
  const periode = req.nextUrl.searchParams.get("periode");
  const dagboekFilter = req.nextUrl.searchParams.get("dagboek");
  const stukFilter = req.nextUrl.searchParams.get("stuk");

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
      return { http: res.status, json, tekst: json ? undefined : redigeer(tekst.slice(0, 300)) };
    } catch (e) {
      return { http: 0, json: null, tekst: redigeer(e instanceof Error ? e.message : String(e)) };
    }
  }

  const q = `?admin=${encodeURIComponent(admin)}`;
  const [adm, dag, gb, rel] = await Promise.all([get("/administrations"), get(`/get/index/0901${q}`), get(`/get/index/0201${q}`), get(`/get/index/0101${q}`)]);
  const admJson = adm.json as { Dir?: { Name?: string; Adms?: { Adm?: unknown } } } | null;
  const relRijen = rijen((rel.json as { R0101?: unknown } | null)?.R0101);

  let mutaties: unknown = undefined;
  if (periode) {
    const m = await get(`/get/index/301T${q}&params=${encodeURIComponent(periode)}`);
    const lijst = rijen((m.json as { R0301?: unknown } | null)?.R0301).filter(
      (r) => (!dagboekFilter || r.F0901 === dagboekFilter) && (!stukFilter || Number(r.F0303) === Number(stukFilter)),
    );
    // Boekstuknummers lopen per dagboek door: alleen tonen als er op één dagboek gefilterd is.
    const nummers = [...new Set(lijst.map((r) => Number(r.F0303)).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    const stukken = dagboekFilter ? { aantal: nummers.length, eerste: nummers[0] ?? null, laatste: nummers.at(-1) ?? null } : undefined;
    mutaties = { http: m.http, aantal: lijst.length, stukken, lijst: lijst.slice(0, 50), fout: m.tekst };
  }

  return NextResponse.json({
    admin,
    // CASH_DAGBOEK gaat voor de instelling cash_dagboek in de database.
    dagboekOmgeving: leesEnv("CASH_DAGBOEK") ?? null,
    mutaties,
    administraties: { http: adm.http, relatie: admJson?.Dir?.Name, lijst: rijen(admJson?.Dir?.Adms?.Adm).map((a) => ({ code: a.Code, naam: a.Name, readOnly: a.ReadOnly })), fout: adm.tekst },
    dagboeken: { http: dag.http, lijst: rijen((dag.json as { R0901?: unknown } | null)?.R0901), fout: dag.tekst },
    grootboek: { http: gb.http, lijst: rijen((gb.json as { R0201?: unknown } | null)?.R0201).map((r) => ({ rek: r.F0201, oms: r.F0203, soort: r.F0204, ob: r.F0242 })), fout: gb.tekst },
    relaties: {
      http: rel.http,
      aantal: relRijen.length,
      velden: relRijen[0] ? Object.keys(relRijen[0]) : [],
      voorbeeld: relRijen.slice(0, 3).map((r) => ({ nr: r.F0101, naam: r.F0103 })),
      gezocht: relaties.map((nr) => ({ nr, gevonden: relRijen.some((r) => Number(r.F0101) === Number(nr)) })),
      // Welke velden zijn bij deze relaties ingevuld (alleen de veldcodes, geen inhoud).
      ingevuld: relaties.map((nr) => {
        const r = relRijen.find((x) => Number(x.F0101) === Number(nr)) ?? {};
        // Codes (geen persoonsgegevens) met waarde; overige velden alleen als "ingevuld".
        const codes = ["F0102", "F0121", "F0122", "F0129", "F0130", "F0111", "F0981", "F0983"];
        return { nr, velden: Object.keys(r).filter((k) => r[k]), codes: Object.fromEntries(codes.filter((k) => r[k]).map((k) => [k, r[k]])) };
      }),
      fout: rel.tekst,
    },
  });
}
