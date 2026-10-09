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
    if (r.btwCents !== 0 && !r.btwGrootboek) p.push(`Regel "${r.omschrijving}" heeft btw maar geen btw-grootboekrekening`);
  }
  return [...new Set(p)];
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

  const btwPerRekening = new Map<string, number>();
  for (const r of b.regels) {
    records.push({
      ...gemeenschappelijk,
      F0201: r.grootboekrekening.toUpperCase(),
      ...(r.kostenplaats ? { F0911: r.kostenplaats.toUpperCase() } : {}),
      F0306: omschrijving(r.omschrijving || b.omschrijving),
      F0307: cashBedrag(-r.bedragExclCents),
    });
    if (r.btwCents !== 0) btwPerRekening.set(r.btwGrootboek, (btwPerRekening.get(r.btwGrootboek) ?? 0) + r.btwCents);
  }
  for (const [rekening, cents] of btwPerRekening) {
    records.push({
      ...gemeenschappelijk,
      F0201: rekening.toUpperCase(),
      F0306: omschrijving(`Btw ${b.omschrijving}`),
      F0307: cashBedrag(-cents),
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

    async boekFactuur(boeking: CashBoeking) {
      const problemen = controleerBoeking(boeking);
      if (problemen.length) throw new CashAfgewezenError(problemen.join("; "));

      const { status, body } = await request("/import", {
        method: "POST",
        body: JSON.stringify({ admin: boeking.administratie, format: 0, content: { cash: [{ R301: naarRecords(boeking) }] } }),
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
