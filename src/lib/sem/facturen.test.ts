import { describe, expect, it } from "vitest";
import type { SemInvoice, SemJournaalpost } from "./client";
import { bouwFacturen } from "./facturen";

const batch = { BatchNumber: 41, CompanyCode: null };

function post(over: Partial<SemJournaalpost>): SemJournaalpost {
  return {
    JournalEntryID: 1,
    BatchNumber: 41,
    CompanyCode: null,
    InvoiceID: 1877,
    InvoiceNumber: 10319,
    InvoiceDate: "2026-09-30T00:00:00",
    DebtorNumber: "10001",
    InvoiceLineID: null,
    InvoiceLineDescription: null,
    AccountCode: null,
    DebitAmount: 0,
    CreditAmount: 0,
    BaseAmount: null,
    TaxAmount: null,
    AmountInclusiveTax: null,
    IsAmountInclusiveTax: false,
    TaxCode: null,
    TaxPercentage: null,
    CostCenterCode: null,
    CostUnitCode: null,
    ...over,
  };
}

const kop = (over: Partial<SemInvoice> = {}): SemInvoice => ({
  InvoiceID: 1877,
  Number: 10319,
  InvoiceDate: "2026-09-30T00:00:00",
  DebtorNumber: "10001",
  TotalAmountEx: 1050,
  TotalAmountIn: 1264.5,
  ...over,
});

const factuurPosten = [
  // Debiteur (geen InvoiceLineID): wordt genegeerd.
  post({ JournalEntryID: 1, AccountCode: "1300", DebitAmount: 1264.5 }),
  post({
    JournalEntryID: 2,
    InvoiceLineID: 25459,
    InvoiceLineDescription: "Zaalhuur",
    AccountCode: 8000,
    CreditAmount: 1000,
    BaseAmount: 1000,
    TaxAmount: 210,
    TaxCode: "Hoog",
    TaxPercentage: 21,
    CostCenterCode: "2000",
    CostUnitCode: "Piet",
  }),
  post({
    JournalEntryID: 3,
    InvoiceLineID: 25460,
    InvoiceLineDescription: "Lunch",
    AccountCode: 8100,
    CreditAmount: 50,
    BaseAmount: 50,
    TaxAmount: 4.5,
    TaxCode: "Laag",
    TaxPercentage: 9,
  }),
];

describe("bouwFacturen", () => {
  it("bouwt een factuur uit de omzetregels en controleert tegen de factuurkop", () => {
    const { facturen, batchProblemen } = bouwFacturen(batch, factuurPosten, [kop()]);
    expect(batchProblemen).toEqual([]);
    expect(facturen).toHaveLength(1);
    const f = facturen[0];
    expect(f).toMatchObject({
      id: "1877",
      factuurnummer: "10319",
      factuurdatum: "2026-09-30",
      soort: "factuur",
      debiteurnummer: "10001",
      batchNumber: 41,
      totaalInclCents: 126450,
      problemen: [],
    });
    expect(f.regels).toEqual([
      { grootboek: "8000", btwCode: "Hoog", btwPercentage: 21, kostenplaats: "2000", kostendrager: "Piet", omschrijving: "Zaalhuur", bedragExclCents: 100000, btwCents: 21000 },
      { grootboek: "8100", btwCode: "Laag", btwPercentage: 9, kostenplaats: null, kostendrager: null, omschrijving: "Lunch", bedragExclCents: 5000, btwCents: 450 },
    ]);
  });

  it("maakt van debetregels een creditnota met negatieve bedragen", () => {
    const posten = [
      post({ JournalEntryID: 9, InvoiceLineID: 1, AccountCode: 8000, DebitAmount: 100, BaseAmount: 100, TaxAmount: 21, TaxCode: "Hoog" }),
    ];
    const { facturen } = bouwFacturen(batch, posten, [kop({ TotalAmountEx: -100, TotalAmountIn: -121 })]);
    expect(facturen[0]).toMatchObject({ soort: "creditnota", problemen: [] });
    expect(facturen[0].regels[0]).toMatchObject({ bedragExclCents: -10000, btwCents: -2100 });
  });

  it("meldt een probleem als de regels niet aansluiten op de factuurtotalen", () => {
    const { facturen } = bouwFacturen(batch, factuurPosten, [kop({ TotalAmountIn: 1300 })]);
    expect(facturen[0].problemen.join(" ")).toContain("wijkt af van het factuurtotaal");
  });

  it("meldt een ontbrekende factuurkop en journaalposten zonder factuur", () => {
    const { facturen, batchProblemen } = bouwFacturen(batch, [...factuurPosten, post({ InvoiceID: null })], []);
    expect(facturen[0].problemen.join(" ")).toContain("Factuurkop niet gevonden");
    expect(batchProblemen.join(" ")).toContain("zonder factuur");
  });

  it("meldt een factuurkop zonder journaalposten", () => {
    const { batchProblemen } = bouwFacturen(batch, factuurPosten, [kop(), kop({ InvoiceID: 2000, Number: 10320 })]);
    expect(batchProblemen.join(" ")).toContain("10320 heeft geen journaalposten");
  });
});
