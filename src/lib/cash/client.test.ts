import { afterEach, describe, expect, it, vi } from "vitest";
import { CashAfgewezenError, cashBedrag, cashDatum, controleerBoeking, createCashClient, naarRecords, type CashBoeking } from "./client";

afterEach(() => vi.unstubAllGlobals());

const boeking: CashBoeking = {
  administratie: "demo",
  dagboek: "verk",
  debiteurenGrootboek: "1300",
  boekdatum: "2026-09-30",
  factuurnummer: "10319",
  debiteurnummer: "1001",
  omschrijving: "Factuur 10319",
  totaalInclCents: 126450,
  regels: [
    { grootboekrekening: "8000", btwGrootboek: "1510", kostenplaats: "200", omschrijving: "Zaalhuur grote zaal met extra lange naam", bedragExclCents: 100000, btwCents: 21000 },
    { grootboekrekening: "8100", btwGrootboek: "1520", omschrijving: "Lunch", bedragExclCents: 5000, btwCents: 450 },
    { grootboekrekening: "8100", btwGrootboek: "1520", omschrijving: "Koffie", bedragExclCents: 1000, btwCents: 90 },
  ],
};
// Totaal klopt met de regels: 1060,00 + 215,40
boeking.totaalInclCents = 106000 + 21540;

describe("CASH-formaten", () => {
  it("formatteert bedragen en datums", () => {
    expect(cashBedrag(126450)).toBe("1264,50");
    expect(cashBedrag(-5)).toBe("-0,05");
    expect(cashDatum("2026-09-30")).toBe("260930");
  });

  it("maakt record-301-regels die op nul sluiten, met btw per rekening", () => {
    const records = naarRecords(boeking);
    expect(records[0]).toEqual({
      F0901: "VERK",
      F0302: "260930",
      F0303: "010319",
      F0201: "1300",
      F0101: "001001",
      F0309: "010319",
      F0306: "Factuur 10319",
      F0307: "1275,40",
    });
    expect(records.map((r) => [r.F0201, r.F0307])).toEqual([
      ["1300", "1275,40"],
      ["8000", "-1000,00"],
      ["8100", "-50,00"],
      ["8100", "-10,00"],
      ["1510", "-210,00"],
      ["1520", "-5,40"],
    ]);
    expect(records[1]).toMatchObject({ F0911: "200", F0306: "Zaalhuur grote zaal met e" });
    const som = records.reduce((s, r) => s + Number(r.F0307.replace(",", ".")) * 100, 0);
    expect(Math.round(som)).toBe(0);
  });

  it("gebruikt de btw-regels uit SEM als die er zijn", () => {
    const b: CashBoeking = {
      ...boeking,
      factuurnummer: "36",
      debiteurnummer: "69",
      debiteurenGrootboek: "1300",
      totaalInclCents: 2885,
      regels: [
        { grootboekrekening: "123215", btwGrootboek: "", omschrijving: "Chocomelk / Fristi", bedragExclCents: 463, btwCents: 42 },
        { grootboekrekening: "123210", btwGrootboek: "", omschrijving: "Bacardi", bedragExclCents: 1967, btwCents: 413 },
      ],
      btwRegels: [
        { grootboekrekening: "1702", omschrijving: "Btw Laag 36", bedragCents: 42 },
        { grootboekrekening: "1701", omschrijving: "Btw Hoog 36", bedragCents: 413 },
      ],
    };
    expect(controleerBoeking(b)).toEqual([]);
    expect(naarRecords(b).map((r) => [r.F0201, r.F0307])).toEqual([
      ["1300", "28,85"],
      ["123215", "-4,63"],
      ["123210", "-19,67"],
      ["1702", "-0,42"],
      ["1701", "-4,13"],
    ]);
    expect(controleerBoeking({ ...b, totaalInclCents: 2900 }).join(" ")).toContain("sluit niet");
  });

  it("controleert veldlengtes", () => {
    expect(controleerBoeking(boeking)).toEqual([]);
    const fout = controleerBoeking({ ...boeking, factuurnummer: "2026-0001", regels: [{ ...boeking.regels[0], kostenplaats: "2000" }] });
    expect(fout.join(" ")).toContain("Factuurnummer");
    expect(fout.join(" ")).toContain("Kostenplaats");
  });
});

function mockFetch(...antwoorden: [number, unknown][]) {
  const fn = vi.fn(async () => {
    const [status, body] = antwoorden.shift()!;
    return new Response(body == null ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const client = () => createCashClient({ baseUrl: "https://www.cashweb.nl/api/4.0", apiKey: "sleutel", pendingWachtMs: 1, pendingPogingen: 2 });

describe("createCashClient", () => {
  it("importeert met de juiste headers en body", async () => {
    const fetch = mockFetch([201, null]);
    const r = await client().boekFactuur(boeking);

    expect(r.boekingId).toBe("verk/10319");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.cashweb.nl/api/4.0/import");
    expect(init.headers).toMatchObject({ Authorization: "sleutel", "Cache-Control": "no-cache", "Sec-Fetch-Mode": "cors" });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ admin: "demo", format: 0 });
    expect(body.content.cash[0].R301).toHaveLength(6);
  });

  it("wacht een Pending-transactie af", async () => {
    mockFetch([202, { status: "Pending", transaction: "abc" }], [200, { status: "Pending" }], [200, { status: "Success" }]);
    await expect(client().boekFactuur(boeking)).resolves.toEqual({ boekingId: "verk/10319 (transactie abc)" });
  });

  it("geeft bij een validatiefout een CashAfgewezenError", async () => {
    mockFetch([400, { error: "Error import", message: { errors: { error: [{ message: "Ongeldige waarde 0201=8000" }] } } }]);
    await expect(client().boekFactuur(boeking)).rejects.toBeInstanceOf(CashAfgewezenError);
  });

  it("geeft bij een blijvende Pending of serverfout een gewone fout (uitkomst onbekend)", async () => {
    mockFetch([202, { status: "Pending", transaction: "abc" }], [200, { status: "Pending" }], [200, { status: "Pending" }]);
    const e1 = await client().boekFactuur(boeking).catch((e) => e);
    expect(e1).not.toBeInstanceOf(CashAfgewezenError);
    expect(e1.message).toContain("uitkomst onbekend");

    mockFetch([502, "Bad gateway"]);
    const e2 = await client().boekFactuur(boeking).catch((e) => e);
    expect(e2).not.toBeInstanceOf(CashAfgewezenError);
  });

  it("stuurt niets als de boeking niet in CASH past", async () => {
    const fetch = mockFetch();
    await expect(client().boekFactuur({ ...boeking, debiteurnummer: "1234567" })).rejects.toBeInstanceOf(CashAfgewezenError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
