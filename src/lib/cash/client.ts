/**
 * Koppeling met CASH via de REST API 4.0.
 *
 * Documentatie: https://www.cashweb.nl/api4.0/ (Swagger) en
 * https://cash.nl/knowledge/recordindeling-cash-financieel (records en velden).
 *
 * Een verkoopfactuur wordt geïmporteerd als set grootboekmutaties (record 301) in het
 * verkoopdagboek, die samen op nul sluiten:
 * - debiteurregel: debiteurenrekening, relatienr, factuurnummer, bedrag incl. btw (+)
 * - omzetregels: grootboek (+ kostenplaats), bedrag excl. btw (−)
 * - btw-regels: per btw-grootboekrekening het btw-bedrag (−)
 * Een creditnota heeft dezelfde regels met omgekeerde tekens.
 */

export interface CashBoekingRegel {
  grootboekrekening: string;
  /** Grootboekrekening waarop de btw van deze regel geboekt wordt (leeg als er geen btw is). */
  btwGrootboek: string;
  kostenplaats?: string;
  kostendrager?: string;
  omschrijving: string;
  bedragExclCents: number;
  btwCents: number;
}

export interface CashBoeking {
  administratie: string;
  dagboek: string;
  debiteurenGrootboek: string;
  /** YYYY-MM-DD */
  boekdatum: string;
  factuurnummer: string;
  debiteurnummer: string;
  omschrijving: string;
  totaalInclCents: number;
  regels: CashBoekingRegel[];
  /**
   * Btw-regels zoals SEM ze aanlevert (per btw-rekening, positief bij een factuur). Ontbreken ze,
   * dan wordt de btw per regel opgeteld per `btwGrootboek`.
   */
  btwRegels?: { grootboekrekening: string; omschrijving: string; bedragCents: number }[];
}

/** De btw-regels van een boeking: uit SEM, of opgeteld uit de omzetregels. */
export function btwRegelsVan(b: CashBoeking): { grootboekrekening: string; omschrijving: string; bedragCents: number }[] {
  if (b.btwRegels && b.btwRegels.length > 0) return b.btwRegels;
  const perRekening = new Map<string, number>();
  for (const r of b.regels) if (r.btwCents !== 0) perRekening.set(r.btwGrootboek, (perRekening.get(r.btwGrootboek) ?? 0) + r.btwCents);
  return [...perRekening].map(([grootboekrekening, bedragCents]) => ({ grootboekrekening, omschrijving: `Btw ${b.omschrijving}`, bedragCents }));
}

export interface CashClient {
  boekFactuur(boeking: CashBoeking): Promise<{ boekingId: string }>;
}

/**
 * CASH heeft de import zeker níet verwerkt (validatiefout, geen rechten). Opnieuw proberen is veilig.
 * Elke andere fout (time-out, verbroken verbinding, "Pending") laat in het midden of de boeking
 * is aangekomen; die factuur wordt niet automatisch opnieuw geboekt.
 */
export class CashAfgewezenError extends Error {}

type Veld = Record<`F${string}`, string>;

/** Bedrag in centen naar CASH-notatie: "1264,50" / "-100,00". */
export function cashBedrag(cents: number): string {
  const teken = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${teken}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** YYYY-MM-DD naar CASH-datum (JJMMDD). */
export function cashDatum(datum: string): string {
  return `${datum.slice(2, 4)}${datum.slice(5, 7)}${datum.slice(8, 10)}`;
}

/** Controleert de CASH-veldformaten; geeft problemen terug (leeg = in orde). */
export function controleerBoeking(b: CashBoeking): string[] {
  const p: string[] = [];
  if (!/^\d{1,6}$/.test(b.debiteurnummer)) p.push(`Debiteurnummer "${b.debiteurnummer}" past niet in CASH (max. 6 cijfers)`);
  if (!/^\d{1,6}$/.test(b.factuurnummer)) p.push(`Factuurnummer "${b.factuurnummer}" past niet in CASH (max. 6 cijfers)`);
  if (!b.dagboek) p.push("CASH-dagboek is niet ingesteld");
  if (!b.debiteurenGrootboek) p.push("CASH-debiteurenrekening is niet ingesteld");
  for (const r of b.regels) {
    if (!r.grootboekrekening || r.grootboekrekening.length > 6) p.push(`Grootboekrekening "${r.grootboekrekening}" past niet in CASH (max. 6 tekens)`);
    if (r.kostenplaats && r.kostenplaats.length > 3) p.push(`Kostenplaats "${r.kostenplaats}" past niet in CASH (max. 3 tekens)`);
    if (r.btwCents !== 0 && !r.btwGrootboek && !b.btwRegels?.length) p.push(`Regel "${r.omschrijving}" heeft btw maar geen btw-grootboekrekening`);
  }
  const btw = btwRegelsVan(b);
  for (const r of btw) {
    if (!r.grootboekrekening || r.grootboekrekening.length > 6) p.push(`Btw-rekening "${r.grootboekrekening}" past niet in CASH (max. 6 tekens)`);
  }
  const som = b.regels.reduce((s, r) => s + r.bedragExclCents, 0) + btw.reduce((s, r) => s + r.bedragCents, 0);
  if (som !== b.totaalInclCents) p.push(`Boeking sluit niet: debiteur ${b.totaalInclCents / 100}, omzet plus btw ${som / 100}`);
  return [...new Set(p)];
}

/**
 * Importbericht voor POST /import. Elk record staat als eigen element in `cash` ({ R301: [regel] }),
 * zoals in het voorbeeld van CASH. Meerdere regels in één R301-lijst worden door CASH niet
 * allemaal verwerkt: in de test (9 oktober 2026) bleef alleen de laatste regel over.
 */
export function importBericht(b: CashBoeking) {
  return { admin: b.administratie, format: 0, content: { cash: naarRecords(b).map((r) => ({ R301: [r] })) } };
}

/** Zet een boeking om naar record-301-regels die samen op nul sluiten. */
export function naarRecords(b: CashBoeking): Veld[] {
  const gemeenschappelijk = {
    F0901: b.dagboek.toUpperCase(),
    F0302: cashDatum(b.boekdatum),
    F0303: b.factuurnummer.padStart(6, "0"),
  };
  const omschrijving = (s: string) => s.slice(0, 25);

  const records: Veld[] = [
    {
      ...gemeenschappelijk,
      F0201: b.debiteurenGrootboek.toUpperCase(),
      F0101: b.debiteurnummer.padStart(6, "0"),
      F0309: b.factuurnummer.padStart(6, "0"),
      F0306: omschrijving(b.omschrijving),
      F0307: cashBedrag(b.totaalInclCents),
    },
  ];

  for (const r of b.regels) {
    records.push({
      ...gemeenschappelijk,
      F0201: r.grootboekrekening.toUpperCase(),
      ...(r.kostenplaats ? { F0911: r.kostenplaats.toUpperCase() } : {}),
      F0306: omschrijving(r.omschrijving || b.omschrijving),
      F0307: cashBedrag(-r.bedragExclCents),
    });
  }
  for (const r of btwRegelsVan(b)) {
    records.push({
      ...gemeenschappelijk,
      F0201: r.grootboekrekening.toUpperCase(),
      F0306: omschrijving(r.omschrijving),
      F0307: cashBedrag(-r.bedragCents),
    });
  }
  return records;
}

const HEADERS = {
  Accept: "*/*",
  "Content-Type": "application/json;charset=UTF-8",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Mode": "cors",
};

export interface CashConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  /** Hoe vaak en hoe lang we een "Pending"-transactie nog navragen. */
  pendingPogingen?: number;
  pendingWachtMs?: number;
}

export function createCashClient(config: CashConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");

  async function request(pad: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${base}${pad}`, {
      ...init,
      headers: { ...HEADERS, Authorization: config.apiKey },
      signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
    });
    const tekst = await res.text();
    let body: unknown = tekst;
    try {
      body = tekst ? JSON.parse(tekst) : null;
    } catch {
      /* geen JSON */
    }
    return { status: res.status, body };
  }

  const kort = (body: unknown) => (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 500);

  async function wachtOpTransactie(id: string): Promise<void> {
    const pogingen = config.pendingPogingen ?? 5;
    for (let i = 0; i < pogingen; i++) {
      await new Promise((r) => setTimeout(r, config.pendingWachtMs ?? 3_000));
      const { status, body } = await request(`/transaction/${encodeURIComponent(id)}`);
      const b = body as { status?: string; error?: string } | null;
      if (status === 200 && b?.status === "Success") return;
      if (status === 200 && b?.status === "Pending") continue;
      if (b?.error) throw new CashAfgewezenError(`CASH-transactie ${id}: ${kort(body)}`);
    }
    throw new Error(`CASH-transactie ${id} staat na ${pogingen} pogingen nog op Pending; uitkomst onbekend.`);
  }

  return {
    async administraties(): Promise<unknown> {
      const { status, body } = await request("/administrations");
      if (status !== 200) throw new CashAfgewezenError(`CASH /administrations: HTTP ${status} ${kort(body)}`);
      return body;
    },

    /** Grootboekmutaties (record 301) van één dagboek en stuknummer in een periode JJPP. */
    async mutaties(admin: string, periode: string, dagboek: string, stuk: string): Promise<Veld[]> {
      const q = `?admin=${encodeURIComponent(admin)}&params=${encodeURIComponent(`${periode}|${periode}`)}`;
      const { status, body } = await request(`/get/index/301T${q}`);
      if (status !== 200) throw new CashAfgewezenError(`CASH 301T: HTTP ${status} ${kort(body)}`);
      const r = (body as { R0301?: unknown } | null)?.R0301;
      const lijst = (r == null ? [] : Array.isArray(r) ? r : Object.values(r as object)) as Veld[];
      return lijst.filter((m) => m.F0901 === dagboek && Number(m.F0303) === Number(stuk));
    },

    /** Losse record-301-regels importeren (bijv. een correctie). Moeten samen op nul sluiten. */
    async importeerRecords(admin: string, records: Veld[]) {
      const saldo = records.reduce((s, r) => s + Math.round(Number(r.F0307.replace(",", ".")) * 100), 0);
      if (saldo !== 0) throw new CashAfgewezenError(`Correctie sluit niet (saldo ${saldo} cent)`);
      const { status, body } = await request("/import", {
        method: "POST",
        body: JSON.stringify({ admin, format: 0, content: { cash: records.map((r) => ({ R301: [r] })) } }),
      });
      if (status === 202) {
        const id = (body as { transaction?: string } | null)?.transaction;
        if (id) await wachtOpTransactie(id);
        return;
      }
      if (status !== 200 && status !== 201) throw new CashAfgewezenError(`HTTP ${status} ${kort(body)}`);
    },

    async boekFactuur(boeking: CashBoeking) {
      const problemen = controleerBoeking(boeking);
      if (problemen.length) throw new CashAfgewezenError(problemen.join("; "));

      const { status, body } = await request("/import", {
        method: "POST",
        body: JSON.stringify(importBericht(boeking)),
      });
      const referentie = `${boeking.dagboek}/${boeking.factuurnummer}`;
      if (status === 201 || status === 200) return { boekingId: referentie };
      if (status === 202) {
        const id = (body as { transaction?: string } | null)?.transaction;
        if (!id) throw new Error(`CASH: import staat op Pending zonder transactie-id; uitkomst onbekend.`);
        await wachtOpTransactie(id);
        return { boekingId: `${referentie} (transactie ${id})` };
      }
      if (status >= 400 && status < 500 && status !== 408) throw new CashAfgewezenError(`HTTP ${status} ${kort(body)}`);
      throw new Error(`CASH: HTTP ${status} ${kort(body)}; uitkomst onbekend.`);
    },
  };
}
