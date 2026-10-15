import { cashBedrag, cashDatum, createCashClient, periodesRond } from "@/lib/cash/client";
import { env, leesEnv } from "@/lib/env";
import { createSemClient, type SemClient } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import type { CashInstellingen } from "./mapping";
import { runSync } from "./run";
import { laadInstellingen, supabaseStore } from "./store";

/** De enige CASH-administratie waarin een testboeking is toegestaan. */
export const TEST_ADMINISTRATIE = "demo";

/**
 * CASH-instellingen voor een run: een omgevingsvariabele in Vercel gaat voor, anders de waarde uit
 * de tabel `instellingen`. Het dagboek staat altijd in hoofdletters, zoals CASH het opslaat.
 */
function cashInstellingenVan(
  e: ReturnType<typeof env>,
  inst: Record<string, string>,
  { administratie = e.CASH_ADMINISTRATIE, dagboek }: { administratie?: string; dagboek?: string } = {},
): CashInstellingen {
  return {
    administratie,
    dagboek: (dagboek || e.CASH_DAGBOEK || inst.cash_dagboek || "").toUpperCase(),
    debiteurenGrootboek: e.CASH_GB_DEBITEUREN || inst.cash_gb_debiteuren || "",
    kostenplaatsNegeren: inst.kostenplaatsen === "negeren",
  };
}

/** Eerste factuurnummer voor de koppeling (SYNC_START_FACTUUR of instelling start_factuurnummer). */
function startFactuurnummerVan(inst: Record<string, string>): number | undefined {
  const waarde = leesEnv("SYNC_START_FACTUUR") || inst.start_factuurnummer;
  if (!waarde) return undefined;
  const n = Number(waarde);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Ongeldig startfactuurnummer "${waarde}".`);
  return n;
}

/**
 * Start een sync met de productieconfiguratie uit de omgevingsvariabelen. Echt boeken buiten de
 * testadministratie kan alleen als CASH_LIVE_ADMINISTRATIE bewust op dezelfde administratie staat.
 */
export async function startSync(trigger: "cron" | "handmatig") {
  const e = env();
  if (!e.SYNC_DRY_RUN && e.CASH_ADMINISTRATIE !== TEST_ADMINISTRATIE && leesEnv("CASH_LIVE_ADMINISTRATIE") !== e.CASH_ADMINISTRATIE) {
    throw new Error(
      `Sync geweigerd: echt boeken in administratie "${e.CASH_ADMINISTRATIE}" vereist CASH_LIVE_ADMINISTRATIE=${e.CASH_ADMINISTRATIE}.`,
    );
  }
  const inst = await laadInstellingen(db());
  return runSync({
    store: supabaseStore(db()),
    sem: createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY }),
    cash: createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY }),
    dryRun: e.SYNC_DRY_RUN,
    startDate: e.SYNC_START_DATE,
    startFactuurnummer: startFactuurnummerVan(inst),
    cashInstellingen: cashInstellingenVan(e, inst),
    trigger,
  });
}

async function stap<T>(naam: string, f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw new Error(`${naam}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Herstelt een mislukte testboeking in "demo": boekt de tegenboeking van alle regels die CASH bij
 * het oude boekstuk heeft staan (zodat dat op nul uitkomt), zet de factuur terug en boekt hem
 * opnieuw volgens de huidige instellingen.
 */
export async function herstelTestboeking(batchNumber: number, invoiceId: number, dagboekNieuw?: string) {
  const e = env();
  if (e.CASH_ADMINISTRATIE !== TEST_ADMINISTRATIE) {
    throw new Error(`Herstel geweigerd: administratie is "${e.CASH_ADMINISTRATIE}", alleen "${TEST_ADMINISTRATIE}" is toegestaan.`);
  }
  const sb = db();
  const { data, error } = await sb
    .from("sem_facturen")
    .select("status, cash_boeking_id, factuurdatum")
    .eq("sem_factuur_id", String(invoiceId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Factuur ${invoiceId} staat niet in de database.`);

  let tegengeboekt = 0;
  const [dagboekOud, stuk] = String(data.cash_boeking_id ?? "").split(" ")[0].split("/");
  const dagboek = (dagboekOud ?? "").toUpperCase();
  if (data.status === "nieuw" || data.status === "gewijzigd_na_boeking") {
    throw new Error(`Herstel geweigerd: factuur heeft status "${data.status}". Controleer eerst in CASH wat er geboekt is.`);
  }
  if (data.status === "geboekt") {
    if (!dagboek || !stuk || !data.factuurdatum) throw new Error("Herstel geweigerd: boekstuk of factuurdatum van de oude boeking ontbreekt.");
    // De correctie krijgt "9" + het oude nummer; CASH staat maximaal 6 cijfers toe.
    if (stuk.replace(/^0+/, "").length > 5) {
      throw new Error(`Herstel kan niet voor ${dagboek}/${stuk}: het correctienummer zou te lang worden. Corrigeer dit boekstuk in CASH.`);
    }
    const cash = createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY });
    const datum = String(data.factuurdatum);
    const [van, tot] = periodesRond(datum);
    const oud = await stap("oude boeking lezen", () => cash.mutaties(TEST_ADMINISTRATIE, van, dagboek, stuk, tot));
    // Niet gevonden: dan niet opnieuw boeken, anders staat hij er mogelijk twee keer in.
    if (oud.length === 0) throw new Error(`Herstel gestopt: ${dagboek}/${stuk} niet gevonden in CASH; er is niets gewijzigd.`);
    const tegen = oud.map((m) => ({
      F0901: dagboek,
      F0302: cashDatum(datum),
      // CASH weigert een bestaand boekstuknummer; daarom een eigen nummer voor de correctie.
      F0303: `9${stuk.replace(/^0+/, "").padStart(5, "0")}`,
      F0201: m.F0201,
      ...(m.F0101 ? { F0101: m.F0101 } : {}),
      F0306: `Correctie ${dagboek}/${stuk}`,
      F0307: cashBedrag(-Math.round(Number(String(m.F0307).replace(",", ".")) * 100)),
    }));
    await stap("tegenboeken", () => cash.importeerRecords(TEST_ADMINISTRATIE, tegen));
    tegengeboekt = tegen.length;
  }

  const { error: e2 } = await sb
    .from("sem_facturen")
    .update({ status: "fout", foutmelding: `Testboeking ${data.cash_boeking_id ?? ""} tegengeboekt; opnieuw geboekt`, cash_boeking_id: null })
    .eq("sem_factuur_id", String(invoiceId));
  if (e2) throw new Error(e2.message);

  return { tegengeboekt, oudBoekstuk: data.cash_boeking_id, nieuw: await startTestboeking(batchNumber, { invoiceId, dagboek: dagboekNieuw }) };
}

export interface TestboekingOpties {
  /** Alleen deze SEM-factuur (InvoiceID); zonder: de hele batch. */
  invoiceId?: number;
  /** Alleen omzetten en tonen, niets naar CASH. */
  proef?: boolean;
  /** Ander dagboek in de testadministratie dan het ingestelde. */
  dagboek?: string;
}

/**
 * Echte testboeking van één SEM-factuur in de CASH-testadministratie "demo", ongeacht de
 * proefmodus. Weigert als de ingestelde administratie niet "demo" is: zo kan dit nooit in de
 * live boekhouding terechtkomen. Gebruikt verder exact dezelfde sync-logica als de nachtelijke run
 * (inclusief bescherming tegen dubbel boeken).
 */
export async function startTestboeking(batchNumber: number, { invoiceId, proef = false, dagboek }: TestboekingOpties = {}) {
  const e = env();
  if (e.CASH_ADMINISTRATIE !== TEST_ADMINISTRATIE) {
    throw new Error(`Testboeking geweigerd: administratie is "${e.CASH_ADMINISTRATIE}", alleen "${TEST_ADMINISTRATIE}" is toegestaan.`);
  }
  const inst = await laadInstellingen(db());
  const echt = createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY });
  const sem: SemClient = {
    async fetchBatches() {
      return (await echt.fetchBatches("2000-01-01")).filter((b) => b.BatchNumber === batchNumber);
    },
    async fetchJournaalposten(b) {
      return (await echt.fetchJournaalposten(b)).filter((p) => invoiceId == null || p.InvoiceID === invoiceId);
    },
    async fetchFacturen(b) {
      return (await echt.fetchFacturen(b)).filter((f) => invoiceId == null || f.InvoiceID === invoiceId);
    },
  };
  return runSync({
    store: supabaseStore(db()),
    sem,
    cash: createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY }),
    dryRun: proef,
    startDate: "2000-01-01",
    cashInstellingen: cashInstellingenVan(e, inst, { administratie: TEST_ADMINISTRATIE, dagboek }),
    trigger: "test",
  });
}
