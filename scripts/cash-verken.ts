/**
 * Bekijk wat de CASH-API-key kan zien, zonder iets te boeken.
 *
 *   npm run cash:verken                 # beschikbare administraties
 *   npm run cash:verken -- demo         # + dagboeken en grootboekrekeningen van administratie "demo"
 *
 * Leest CASH_BASE_URL en CASH_API_KEY uit .env.local.
 */
const HEADERS = { Accept: "*/*", "Content-Type": "application/json;charset=UTF-8", "Cache-Control": "no-cache", "Sec-Fetch-Mode": "cors" };

async function get(pad: string) {
  const base = (process.env.CASH_BASE_URL || "https://www.cashweb.nl/api/4.0").replace(/\/+$/, "");
  const apiKey = process.env.CASH_API_KEY;
  if (!apiKey) throw new Error("Zet CASH_API_KEY in .env.local");
  const res = await fetch(`${base}${pad}`, { headers: { ...HEADERS, Authorization: apiKey }, signal: AbortSignal.timeout(60_000) });
  const tekst = await res.text();
  if (!res.ok) throw new Error(`${pad}: HTTP ${res.status} ${tekst.slice(0, 300)}`);
  return JSON.parse(tekst);
}

/** CASH geeft lijsten terug als { "0": {...}, "1": {...} } of als array. */
const rijen = (x: unknown): Record<string, string>[] => (x == null ? [] : Array.isArray(x) ? x : Object.values(x as object));

async function main() {
  const [admin] = process.argv.slice(2);
  const adms = await get("/administrations");
  console.log(`Relatie: ${adms?.Dir?.Name} ${adms?.Dir?.Relnm ?? ""}`);
  console.table(rijen(adms?.Dir?.Adms?.Adm).map((a) => ({ Code: a.Code, Naam: a.Name, ReadOnly: a.ReadOnly })));
  if (!admin) return;

  const q = `?admin=${encodeURIComponent(admin)}`;
  const dagboeken = await get(`/get/index/0901${q}`);
  console.log(`\nDagboeken in ${admin} (soort: V = verkoop):`);
  console.table(rijen(dagboeken?.R0901).map((d) => ({ code: d.F0901, naam: d.F0902, soort: d.F0903, rekening: d.F0201 })));

  const gb = await get(`/get/index/0201${q}`);
  console.log(`\nGrootboekrekeningen in ${admin}:`);
  console.table(rijen(gb?.R0201).map((r) => ({ rekening: r.F0201, omschrijving: r.F0203, soort: r.F0204, obTarief: r.F0242 })));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
