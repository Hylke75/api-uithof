import { describe, expect, it } from "vitest";
import { CashAfgewezenError, type CashBoeking, type CashClient } from "@/lib/cash/client";
import type { SemBatch, SemClient, SemInvoice, SemJournaalpost } from "@/lib/sem/client";
import type { Mappings } from "./mapping";
import { runSync } from "./run";
import type { FactuurRow, SyncStore } from "./store";

function memoryStore(mappings: Mappings, vorigeWindowTo: string | null = null) {
  const facturen = new Map<string, FactuurRow>();
  const batches = new Map<number, { nFacturen: number; fout: string | null }>();
  const runs: Record<string, unknown>[] = [];
  const store: SyncStore = {
    async laatsteVoltooideRun() {
      return vorigeWindowTo ? { window_to: vorigeWindowTo } : null;
    },
    async startRun(run) {
      runs.push({ ...run, status: "running" });
      return `run-${runs.length}`;
    },
    async finishRun(id, patch) {
      Object.assign(runs[Number(id.split("-")[1]) - 1], patch);
    },
    async bestaandeFacturen(ids) {
      return new Map(
        ids.filter((id) => facturen.has(id)).map((id) => [id, { status: facturen.get(id)!.status, content_hash: facturen.get(id)!.content_hash }]),
      );
    },
    async markeerFactuur(id, patch) {
      Object.assign(facturen.get(id)!, patch);
    },
    async upsertFactuur(row) {
      facturen.set(row.sem_factuur_id, { ...facturen.get(row.sem_factuur_id), ...row });
    },
    async upsertBatch({ batch, nFacturen, fout }) {
      batches.set(batch.BatchNumber, { nFacturen, fout });
    },
    async laadMappings() {
      return mappings;
    },
  };
  return { store, facturen, batches, runs };
}

const mappings: Mappings = {
  grootboek: new Map([["8100", { grootboekrekening: "8150", actief: true }]]),
  btwGrootboek: new Map([
    ["Hoog", "1510"],
    ["Laag", "1520"],
  ]),
  debiteur: new Map(),
};

/** Eén batch met één factuur (2 omzetregels), zoals SEM hem levert. */
function semMet(opts: { totaalIn?: number; extra?: Partial<SemJournaalpost>; factuurdatum?: string; falen?: boolean; debiteurRekening?: string } = {}) {
  const datum = opts.factuurdatum ?? "2026-09-30T00:00:00";
  const regel = (id: number, acc: number, ex: number, tax: number, code: string): SemJournaalpost => ({
    JournalEntryID: id,
    BatchNumber: 41,
    CompanyCode: null,
    InvoiceID: 1877,
    InvoiceNumber: 10319,
    InvoiceDate: datum,
    DebtorNumber: "10001",
    InvoiceLineID: id,
    InvoiceLineDescription: `Regel ${id}`,
    AccountCode: acc,
    DebitAmount: 0,
    CreditAmount: ex,
    BaseAmount: ex,
    TaxAmount: tax,
    AmountInclusiveTax: ex + tax,
    IsAmountInclusiveTax: false,
    TaxCode: code,
    TaxPercentage: null,
    CostCenterCode: null,
    CostUnitCode: null,
    ...opts.extra,
  });
  const kop: SemInvoice = { InvoiceID: 1877, Number: 10319, InvoiceDate: datum, DebtorNumber: "10001", TotalAmountEx: 1050, TotalAmountIn: opts.totaalIn ?? 1264.5 };
  const vensters: string[] = [];
  const sem: SemClient = {
    async fetchBatches(from) {
      vensters.push(from);
      if (opts.falen) throw new Error("SEM down");
      return [{ BatchNumber: 41, CompanyCode: null, CompanyID: 1, CreatedAt: null, Name: "Week 40" } satisfies SemBatch];
    },
    async fetchJournaalposten() {
      const posten = [regel(1, 8000, 1000, 210, "Hoog"), regel(2, 8100, 50, 4.5, "Laag")];
      if (opts.debiteurRekening) {
        // Debiteurregel zoals SEM die levert: geen InvoiceLineID, debet = totaal incl. btw.
        posten.push({ ...regel(3, 0, 0, 0, ""), InvoiceLineID: null, AccountCode: opts.debiteurRekening, CreditAmount: 0, DebitAmount: 1264.5, BaseAmount: null, TaxAmount: null, TaxCode: null });
      }
      return posten;
    },
    async fetchFacturen() {
      return [kop];
    },
  };
  return { sem, vensters };
}

function cashSpy(fout?: Error) {
  const geboekt: CashBoeking[] = [];
  const client: CashClient = {
    async boekFactuur(b) {
      if (fout) throw fout;
      geboekt.push(b);
      return { boekingId: `B${geboekt.length}` };
    },
  };
  return { client, geboekt };
}

const basis = {
  startDate: "2026-01-01",
  cashInstellingen: { administratie: "demo", dagboek: "VERK", debiteurenGrootboek: "1300" },
  trigger: "cron" as const,
  now: new Date("2026-10-02T01:00:00Z"),
};

describe("runSync", () => {
  it("boekt niets in proefmodus maar legt de boeking vast", async () => {
    const { store, facturen, batches } = memoryStore(mappings);
    const cash = cashSpy();
    const r = await runSync({ ...basis, store, sem: semMet().sem, cash: cash.client, dryRun: true });

    expect(r).toMatchObject({ status: "success", n_batches: 1, n_opgehaald: 1, n_proef: 1, n_geboekt: 0 });
    expect(cash.geboekt).toHaveLength(0);
    expect(batches.get(41)).toEqual({ nFacturen: 1, fout: null });
    const row = facturen.get("1877")!;
    expect(row).toMatchObject({ status: "proef", factuurnummer: "10319", sem_batch_number: 41, totaal_incl_cents: 126450 });
    const boeking = row.cash_payload as CashBoeking;
    expect(boeking).toMatchObject({ debiteurnummer: "10001", dagboek: "VERK", debiteurenGrootboek: "1300" });
    expect(boeking.regels.map((x) => [x.grootboekrekening, x.btwGrootboek])).toEqual([
      ["8000", "1510"],
      ["8150", "1520"],
    ]);
  });

  it("neemt de debiteurenrekening van SEM over (voorschotfactuur op 1320)", async () => {
    const { store, facturen } = memoryStore(mappings);
    await runSync({ ...basis, store, sem: semMet({ debiteurRekening: "1320" }).sem, cash: cashSpy().client, dryRun: true });
    expect((facturen.get("1877")!.cash_payload as CashBoeking).debiteurenGrootboek).toBe("1320");
  });

  it("boekt live en boekt een geboekte factuur nooit opnieuw", async () => {
    const { store, facturen } = memoryStore(mappings);
    const cash = cashSpy();
    const { sem } = semMet();

    await runSync({ ...basis, store, sem, cash: cash.client, dryRun: false });
    const tweede = await runSync({ ...basis, store, sem, cash: cash.client, dryRun: false });

    expect(cash.geboekt).toHaveLength(1);
    expect(facturen.get("1877")).toMatchObject({ status: "geboekt", cash_boeking_id: "B1" });
    expect(tweede).toMatchObject({ n_overgeslagen: 1, n_geboekt: 0 });
  });

  it("markeert een factuur die na boeking in SEM gewijzigd is", async () => {
    const { store, facturen } = memoryStore(mappings);
    const cash = cashSpy();
    await runSync({ ...basis, store, sem: semMet().sem, cash: cash.client, dryRun: false });

    const r = await runSync({ ...basis, store, sem: semMet({ extra: { CostCenterCode: "2000" } }).sem, cash: cash.client, dryRun: false });

    expect(cash.geboekt).toHaveLength(1);
    expect(r.status).toBe("partial");
    expect(facturen.get("1877")).toMatchObject({ status: "gewijzigd_na_boeking", cash_boeking_id: "B1" });
  });

  it("boekt niet als de totalen niet kloppen of een btw-mapping ontbreekt", async () => {
    const { store, facturen } = memoryStore({ ...mappings, btwGrootboek: new Map([["Hoog", "1510"]]) });
    const cash = cashSpy();
    const r = await runSync({ ...basis, store, sem: semMet({ totaalIn: 1300 }).sem, cash: cash.client, dryRun: false });

    expect(r).toMatchObject({ status: "partial", n_fout: 1 });
    expect(cash.geboekt).toHaveLength(0);
    expect(facturen.get("1877")!.foutmelding).toContain("wijkt af van het factuurtotaal");
    expect(facturen.get("1877")!.foutmelding).toContain('SEM-btw-code "Laag"');
  });

  it("boekt niet als een nummer niet in CASH past", async () => {
    const { store, facturen } = memoryStore({ ...mappings, debiteur: new Map([["10001", "D-10001"]]) });
    const r = await runSync({ ...basis, store, sem: semMet().sem, cash: cashSpy().client, dryRun: true });

    expect(r).toMatchObject({ n_proef: 0, n_fout: 1 });
    expect(facturen.get("1877")!.foutmelding).toContain("max. 6 cijfers");
  });

  it("boekt niet opnieuw als de uitkomst van een eerdere boekpoging onbekend is", async () => {
    const { store, facturen } = memoryStore(mappings);
    facturen.set("1877", { status: "nieuw", content_hash: "x" } as FactuurRow);
    const cash = cashSpy();
    const r = await runSync({ ...basis, store, sem: semMet().sem, cash: cash.client, dryRun: false });

    expect(cash.geboekt).toHaveLength(0);
    expect(r.n_fout).toBe(1);
  });

  it("zet een door CASH afgewezen factuur op fout, zodat hij later opnieuw geprobeerd wordt", async () => {
    const { store, facturen } = memoryStore(mappings);
    const r = await runSync({ ...basis, store, sem: semMet().sem, cash: cashSpy(new CashAfgewezenError("Ongeldige waarde 0201=8000")).client, dryRun: false });

    expect(r.status).toBe("partial");
    expect(facturen.get("1877")).toMatchObject({ status: "fout", foutmelding: "CASH: Ongeldige waarde 0201=8000" });
  });

  it("laat een factuur op nieuw staan als de uitkomst bij CASH onbekend is, en boekt hem niet opnieuw", async () => {
    const { store, facturen } = memoryStore(mappings);
    const { sem } = semMet();
    await runSync({ ...basis, store, sem, cash: cashSpy(new Error("timeout")).client, dryRun: false });
    expect(facturen.get("1877")!.status).toBe("nieuw");
    expect(facturen.get("1877")!.foutmelding).toContain("timeout");

    const cash = cashSpy();
    await runSync({ ...basis, store, sem, cash: cash.client, dryRun: false });
    expect(cash.geboekt).toHaveLength(0);
  });

  it("slaat facturen van vóór de startdatum over", async () => {
    const { store, facturen } = memoryStore(mappings);
    const r = await runSync({ ...basis, store, sem: semMet({ factuurdatum: "2025-12-31T00:00:00" }).sem, cash: cashSpy().client, dryRun: true });

    expect(r).toMatchObject({ status: "success", n_overgeslagen: 1, n_proef: 0 });
    expect(facturen.size).toBe(0);
  });

  it("zet de run op failed als SEM niet bereikbaar is", async () => {
    const { store, runs } = memoryStore(mappings);
    const r = await runSync({ ...basis, store, sem: semMet({ falen: true }).sem, cash: cashSpy().client, dryRun: true });
    expect(r).toMatchObject({ status: "failed", error: "SEM down" });
    expect(runs[0]).toMatchObject({ status: "failed", error: "SEM down" });
  });

  it("haalt batches op vanaf de vorige run min de terugkijkperiode, maar nooit vóór de startdatum", async () => {
    const a = semMet();
    await runSync({ ...basis, store: memoryStore(mappings, "2026-10-01").store, sem: a.sem, cash: cashSpy().client, dryRun: true });
    await runSync({ ...basis, startDate: "2026-09-28", store: memoryStore(mappings, "2026-10-01").store, sem: a.sem, cash: cashSpy().client, dryRun: true });
    await runSync({ ...basis, store: memoryStore(mappings).store, sem: a.sem, cash: cashSpy().client, dryRun: true });

    expect(a.vensters).toEqual(["2026-09-24", "2026-09-28", "2026-01-01"]);
  });
});
