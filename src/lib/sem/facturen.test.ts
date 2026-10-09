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
      debiteurGrootboek: "1300",
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

  it("verwerkt een echte journaalpost uit de SEM-testomgeving (batch 94, factuur 36)", () => {
    const basis = { BatchNumber: 94, CompanyCode: "Outdoor", InvoiceID: 1989, InvoiceNumber: 36, InvoiceDate: "2024-08-16", DebtorNumber: "69" };
    const posten: SemJournaalpost[] = [
      post({ ...basis, JournalEntryID: 11971, AccountTypeCode: "DEB", AccountCode: "101095", DebitAmount: 28.85, CreditAmount: 0, TaxAmount: 4.55, BaseAmount: 0 }),
      post({ ...basis, JournalEntryID: 11972, AccountTypeCode: "BLA", AccountCode: "101097", CreditAmount: 0.42, TaxAmount: 0.42, TaxCode: "Laag", TaxPercentage: 9, BaseAmount: 4.63 }),
      post({ ...basis, JournalEntryID: 11973, AccountTypeCode: "BHO", AccountCode: "120000", CreditAmount: 4.13, TaxAmount: 4.13, TaxCode: "Hoog", TaxPercentage: 21, BaseAmount: 19.67 }),
      post({ ...basis, JournalEntryID: 11975, AccountTypeCode: "OPB", AccountCode: "123215", InvoiceLineID: 27306, InvoiceLineDescription: "Chocomelk / Fristi", CreditAmount: 4.63, TaxAmount: 0.42, TaxCode: "Laag", TaxPercentage: 9, BaseAmount: 0, AmountInclusiveTax: 5.04, CostCenterCode: "0140" }),
      post({ ...basis, JournalEntryID: 11974, AccountTypeCode: "OPB", AccountCode: "123210", InvoiceLineID: 27307, InvoiceLineDescription: "Bacardi", CreditAmount: 19.67, TaxAmount: 4.13, TaxCode: "Hoog", TaxPercentage: 21, BaseAmount: 0, IsAmountInclusiveTax: true, AmountInclusiveTax: 23.8, CostCenterCode: "0140" }),
    ];
    const { facturen, batchProblemen } = bouwFacturen({ BatchNumber: 94, CompanyCode: "Outdoor" }, posten, [
      { InvoiceID: 1989, Number: 36, InvoiceDate: "2024-08-16", DebtorNumber: "69", TotalAmountEx: 24.3, TotalAmountIn: 28.85, AmountTax: 4.55 },
    ]);
    expect(batchProblemen).toEqual([]);
    const f = facturen[0];
    expect(f).toMatchObject({ factuurnummer: "36", debiteurnummer: "69", debiteurGrootboek: "101095", debiteurTotaalCents: 2885, totaalInclCents: 2885, problemen: [] });
    expect(f.regels.map((r) => [r.grootboek, r.bedragExclCents, r.btwCents, r.kostenplaats])).toEqual([
      ["123215", 463, 42, "0140"],
      ["123210", 1967, 413, "0140"],
    ]);
    expect(f.btwRegels).toEqual([
      { grootboek: "101097", btwCode: "Laag", btwPercentage: 9, bedragCents: 42 },
      { grootboek: "120000", btwCode: "Hoog", btwPercentage: 21, bedragCents: 413 },
    ]);
  });

  it("behandelt KASSA als omzet zonder btw en KOR als negatieve regel (batch 93, factuur 35)", () => {
    const basis = { BatchNumber: 93, CompanyCode: null, InvoiceID: 1963, InvoiceNumber: 35, InvoiceDate: "2023-10-27", DebtorNumber: "69" };
    const posten: SemJournaalpost[] = [
      post({ ...basis, JournalEntryID: 11966, AccountTypeCode: "KOR", AccountCode: "100001", InvoiceLineID: 27201, InvoiceLineDescription: "Frisdrank 20%", CreditAmount: -4, TaxAmount: -0.36, TaxCode: "Laag", AmountInclusiveTax: -4.36 }),
      post({ ...basis, JournalEntryID: 11967, AccountTypeCode: "DEB", AccountCode: "101095", DebitAmount: 17.44, TaxAmount: 1.44 }),
      post({ ...basis, JournalEntryID: 11968, AccountTypeCode: "BLA", AccountCode: "101097", CreditAmount: -0.36, TaxAmount: -0.36, TaxCode: "Laag", BaseAmount: -4 }),
      post({ ...basis, JournalEntryID: 11969, AccountTypeCode: "KASSA", AccountCode: "120100", CreditAmount: 21.8, TaxCode: "Nul" }),
      post({ ...basis, JournalEntryID: 11970, AccountTypeCode: "OPB", AccountCode: "123210", InvoiceLineID: 27200, InvoiceLineDescription: "fanta01", TaxCode: "Laag" }),
    ];
    const { facturen } = bouwFacturen({ BatchNumber: 93, CompanyCode: null }, posten, []);
    const f = facturen[0];
    expect(f.regels.map((r) => [r.grootboek, r.bedragExclCents, r.btwCents])).toEqual([
      ["100001", -400, -36],
      ["120100", 2180, 0],
    ]);
    expect(f.btwRegels).toEqual([{ grootboek: "101097", btwCode: "Laag", btwPercentage: null, bedragCents: -36 }]);
    expect(f.debiteurTotaalCents).toBe(1744);
    expect(f.problemen.join(" ")).not.toContain("sluit niet");
  });
});
