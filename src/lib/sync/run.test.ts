import { describe, expect, it } from "vitest";
import type { CashBoeking, CashClient } from "@/lib/cash/client";
import type { SemFactuur } from "@/lib/sem/client";
import { contentHash } from "./hash";
import type { Mappings } from "./mapping";
import { runSync } from "./run";
import type { FactuurRow, SyncStore } from "./store";

function memoryStore(mappings: Mappings, vorigeWindowTo: string | null = null) {
  const facturen = new Map<string, FactuurRow>();
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
    async laadMappings() {
      return mappings;
    },
  };
  return { store, facturen, runs };
}

const mappings: Mappings = {
  omzetsoort: new Map([
    ["ZAALHUUR", { grootboekrekening: "8000", btwCode: "H", actief: true }],
    ["CATERING", { grootboekrekening: "8100", btwCode: "L", kostenplaats: "KP1", actief: true }],
  ]),
  debiteur: new Map([["K1", "10001"]]),
};

const factuur = (over: Partial<SemFactuur> = {}): SemFactuur => ({
  id: "F1",
  factuurnummer: "2026-0001",
  factuurdatum: "2026-09-30",
  soort: "factuur",
  debiteurId: "K1",
  regels: [
    { omzetsoort: "ZAALHUUR", omschrijving: "Zaal A", bedragExclCents: 100000, btwCents: 21000 },
    { omzetsoort: "CATERING", omschrijving: "Lunch", bedragExclCents: 5000, btwCents: 450 },
  ],
  ...over,
});

function cashSpy(fail = false) {
  const geboekt: CashBoeking[] = [];
  const client: CashClient = {
    async boekFactuur(b) {
      if (fail) throw new Error("timeout");
      geboekt.push(b);
      return { boekingId: `B${geboekt.length}` };
    },
  };
  return { client, geboekt };
}

const basis = { startDate: "2026-01-01", administratie: "TEST", trigger: "cron" as const, now: new Date("2026-10-02T01:00:00Z") };

describe("runSync", () => {
  it("boekt niets in proefmodus maar legt de boeking vast", async () => {
    const { store, facturen } = memoryStore(mappings);
    const cash = cashSpy();
    const r = await runSync({ ...basis, store, sem: { fetchFacturen: async () => [factuur()] }, cash: cash.client, dryRun: true });

    expect(r).toMatchObject({ status: "success", n_opgehaald: 1, n_proef: 1, n_geboekt: 0 });
    expect(cash.geboekt).toHaveLength(0);
    const row = facturen.get("F1")!;
    expect(row.status).toBe("proef");
    expect(row.totaal_incl_cents).toBe(126450);
    expect((row.cash_payload as CashBoeking).regels[1]).toMatchObject({ grootboekrekening: "8100", kostenplaats: "KP1" });
  });

  it("boekt live en boekt een geboekte factuur nooit opnieuw", async () => {
    const { store, facturen } = memoryStore(mappings);
    const cash = cashSpy();
    const sem = { fetchFacturen: async () => [factuur()] };

    await runSync({ ...basis, store, sem, cash: cash.client, dryRun: false });
    const tweede = await runSync({ ...basis, store, sem, cash: cash.client, dryRun: false });

    expect(cash.geboekt).toHaveLength(1);
    expect(facturen.get("F1")).toMatchObject({ status: "geboekt", cash_boeking_id: "B1" });
    expect(tweede).toMatchObject({ n_overgeslagen: 1, n_geboekt: 0 });
  });

  it("markeert een factuur die na boeking in SEM gewijzigd is", async () => {
    const { store, facturen } = memoryStore(mappings);
    const cash = cashSpy();
    await runSync({ ...basis, store, sem: { fetchFacturen: async () => [factuur()] }, cash: cash.client, dryRun: false });

    const gewijzigd = factuur({ debiteurNaam: "Andere naam" });
    const r = await runSync({ ...basis, store, sem: { fetchFacturen: async () => [gewijzigd] }, cash: cash.client, dryRun: false });

    expect(cash.geboekt).toHaveLength(1);
    expect(r.status).toBe("partial");
    expect(facturen.get("F1")!.status).toBe("gewijzigd_na_boeking");
    expect(facturen.get("F1")!.cash_boeking_id).toBe("B1");
  });

  it("meldt ontbrekende mappings zonder te boeken", async () => {
    const { store, facturen } = memoryStore(mappings);
    const cash = cashSpy();
    const f = factuur({ debiteurId: "ONBEKEND", regels: [{ omzetsoort: "NIEUW", omschrijving: "x", bedragExclCents: 100, btwCents: 21 }] });
    const r = await runSync({ ...basis, store, sem: { fetchFacturen: async () => [f] }, cash: cash.client, dryRun: false });

    expect(r).toMatchObject({ status: "partial", n_fout: 1 });
    expect(cash.geboekt).toHaveLength(0);
    expect(facturen.get("F1")!.foutmelding).toContain("ONBEKEND");
    expect(facturen.get("F1")!.foutmelding).toContain("NIEUW");
  });

  it("boekt niet opnieuw als de uitkomst van een eerdere boekpoging onbekend is", async () => {
    const { store, facturen } = memoryStore(mappings);
    const f = factuur();
    facturen.set("F1", { status: "nieuw", content_hash: contentHash(f) } as FactuurRow);
    const cash = cashSpy();
    const r = await runSync({ ...basis, store, sem: { fetchFacturen: async () => [f] }, cash: cash.client, dryRun: false });

    expect(cash.geboekt).toHaveLength(0);
    expect(r.n_fout).toBe(1);
  });

  it("registreert een CASH-fout per factuur en gaat door", async () => {
    const { store, facturen } = memoryStore(mappings);
    const r = await runSync({ ...basis, store, sem: { fetchFacturen: async () => [factuur()] }, cash: cashSpy(true).client, dryRun: false });

    expect(r.status).toBe("partial");
    expect(facturen.get("F1")).toMatchObject({ status: "fout", foutmelding: "CASH: timeout" });
  });

  it("zet de run op failed als SEM niet bereikbaar is", async () => {
    const { store, runs } = memoryStore(mappings);
    const r = await runSync({
      ...basis,
      store,
      sem: { fetchFacturen: async () => { throw new Error("SEM down"); } },
      cash: cashSpy().client,
      dryRun: true,
    });
    expect(r).toMatchObject({ status: "failed", error: "SEM down" });
    expect(runs[0]).toMatchObject({ status: "failed", error: "SEM down" });
  });

  it("bepaalt het venster met terugkijkperiode, maar nooit vóór de startdatum", async () => {
    const vensters: [string, string][] = [];
    const sem = { fetchFacturen: async (from: string, to: string) => (vensters.push([from, to]), []) };

    await runSync({ ...basis, store: memoryStore(mappings, "2026-10-01").store, sem, cash: cashSpy().client, dryRun: true });
    await runSync({ ...basis, startDate: "2026-09-28", store: memoryStore(mappings, "2026-10-01").store, sem, cash: cashSpy().client, dryRun: true });
    await runSync({ ...basis, store: memoryStore(mappings).store, sem, cash: cashSpy().client, dryRun: true });

    expect(vensters).toEqual([
      ["2026-09-24", "2026-10-02"],
      ["2026-09-28", "2026-10-02"],
      ["2026-01-01", "2026-10-02"],
    ]);
  });
});
