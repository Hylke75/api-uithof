/**
 * Koppeling met Smart Event Manager (SEM).
 *
 * Documentatie: https://support.smarteventmanager.com/api/html/f7c1ff93-5b8d-58b2-9591-29eb62b8c1cb.htm
 * - Authenticatie: header `ApiKey`.
 * - JournalEntryBatches/GetJournalEntryBatches: batches die sinds een datum zijn aangemaakt/gewijzigd.
 * - JournalEntries/GetJournalEntries: de journaalposten van één batch.
 *
 * Batches worden altijd met de hand in SEM aangemaakt; via de API kunnen ze niet aangemaakt of
 * als verwerkt gemarkeerd worden. Wij houden zelf bij welke batches/facturen verwerkt zijn.
 *
 * SEM documenteert GET met een JSON-body en staat POST toe als alternatief; `fetch` kan geen GET
 * met body sturen, dus we gebruiken POST.
 */

/** JournalEntryBatchModel */
export interface SemBatch {
  BatchNumber: number;
  CompanyCode: string | null;
  CompanyID: number | null;
  CreatedAt: string | null;
  Name: string | null;
}

/** JournalEntryModel (alleen de velden die wij gebruiken). */
export interface SemJournaalpost {
  JournalEntryID: number;
  BatchNumber: number | null;
  BatchDate?: string | null;
  CompanyCode: string | null;
  InvoiceID: number | null;
  InvoiceNumber: number | string | null;
  InvoiceDate: string | null;
  AdministrationDate?: string | null;
  DebtorNumber: string | null;
  RelationID?: number | null;
  InvoiceLineID: number | null;
  InvoiceLineDescription: string | null;
  AccountCode: string | number | null;
  AccountTypeCode?: string | null;
  DebitAmount: number | null;
  CreditAmount: number | null;
  BaseAmount: number | null;
  TaxAmount: number | null;
  AmountInclusiveTax: number | null;
  IsAmountInclusiveTax?: boolean | null;
  TaxCode: string | null;
  TaxPercentage: number | null;
  CostCenterCode: string | null;
  CostUnitCode: string | null;
  ModifiedAt?: string | null;
}

/** InvoiceModel (alleen de kopvelden die wij gebruiken). */
export interface SemInvoice {
  InvoiceID: number;
  Number: number | string | null;
  InvoiceDate: string | null;
  DebtorNumber: string | null;
  RelationID?: number | null;
  InvoiceTypeID?: number | null;
  TotalAmountEx: number | null;
  TotalAmountIn: number | null;
  AmountTax?: number | null;
  ModifiedAt?: string | null;
}

export type FactuurSoort = "factuur" | "creditnota";

export interface SemFactuurRegel {
  /** SEM-grootboekrekening (AccountCode). */
  grootboek: string;
  /** SEM-btw-code (TaxCode), leeg als die ontbreekt. */
  btwCode: string;
  btwPercentage: number | null;
  kostenplaats: string | null;
  kostendrager: string | null;
  omschrijving: string;
  /** Omzet exclusief btw in centen; positief bij een factuur, negatief bij een creditnota. */
  bedragExclCents: number;
  btwCents: number;
}

export interface SemFactuur {
  /** SEM InvoiceID, als string. */
  id: string;
  factuurnummer: string;
  /** YYYY-MM-DD */
  factuurdatum: string;
  soort: FactuurSoort;
  debiteurnummer: string;
  batchNumber: number;
  companyCode: string | null;
  regels: SemFactuurRegel[];
  /**
   * Debiteurenrekening uit de debiteurregel van SEM (bijv. 1300 gewoon, 1320 voorschot);
   * null als SEM geen herkenbare debiteurregel levert.
   */
  debiteurGrootboek: string | null;
  /** Totalen uit de factuurkop (GetInvoices), om de regels tegen te controleren. */
  totaalExclCents: number | null;
  totaalInclCents: number | null;
  /** Problemen bij het samenstellen; een factuur met problemen wordt nooit geboekt. */
  problemen: string[];
}

export interface SemClient {
  /** Batches die sinds `fromModifiedAt` (YYYY-MM-DD) zijn aangemaakt of gewijzigd. */
  fetchBatches(fromModifiedAt: string): Promise<SemBatch[]>;
  fetchJournaalposten(batch: Pick<SemBatch, "BatchNumber" | "CompanyCode">): Promise<SemJournaalpost[]>;
  /** Factuurkoppen (zonder regels) van één batch. */
  fetchFacturen(batch: Pick<SemBatch, "BatchNumber" | "CompanyCode">): Promise<SemInvoice[]>;
}

export class SemApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function createSemClient(config: { baseUrl: string; apiKey: string; timeoutMs?: number }): SemClient {
  const base = config.baseUrl.replace(/\/+$/, "").replace(/\/api$/i, "");

  async function call<T>(pad: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}/api/${pad}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", ApiKey: config.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 60_000),
      });
    } catch (e) {
      throw new SemApiError(`SEM ${pad}: geen verbinding (${e instanceof Error ? e.message : String(e)})`);
    }
    const tekst = await res.text();
    if (!res.ok) {
      throw new SemApiError(`SEM ${pad}: HTTP ${res.status} ${tekst.slice(0, 300)}`, res.status);
    }
    try {
      return JSON.parse(tekst) as T;
    } catch {
      throw new SemApiError(`SEM ${pad}: antwoord is geen JSON (${tekst.slice(0, 120)})`, res.status);
    }
  }

  return {
    async fetchBatches(fromModifiedAt) {
      const r = await call<{ JournalEntryBatches?: SemBatch[] | null }>("JournalEntryBatches/GetJournalEntryBatches", {
        JournalEntryBatchFilter: { FromModifiedAt: `${fromModifiedAt}T00:00` },
      });
      return r.JournalEntryBatches ?? [];
    },

    async fetchJournaalposten(batch) {
      const r = await call<{ JournalEntries?: SemJournaalpost[] | null }>("JournalEntries/GetJournalEntries", {
        JournalEntryFilter: {
          BatchNumber: String(batch.BatchNumber),
          ...(batch.CompanyCode ? { CompanyCode: batch.CompanyCode } : {}),
        },
      });
      return r.JournalEntries ?? [];
    },

    async fetchFacturen(batch) {
      const r = await call<{ Invoices?: SemInvoice[] | null }>("Invoices/GetInvoices", {
        InvoiceFilter: {
          BatchNumbers: [batch.BatchNumber],
          ...(batch.CompanyCode ? { CompanyCodes: [batch.CompanyCode] } : {}),
        },
        InvoiceLoadOptions: { DoLoadInvoiceLines: false },
      });
      return r.Invoices ?? [];
    },
  };
}
