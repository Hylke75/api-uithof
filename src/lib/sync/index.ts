import { cashBedrag, cashDatum, createCashClient } from "@/lib/cash/client";
import { env } from "@/lib/env";
import { createSemClient, type SemClient } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import { runSync } from "./run";
import { laadInstellingen, supabaseStore } from "./store";

/** De enige CASH-administratie waarin een testboeking is toegestaan. */
export const TEST_ADMINISTRATIE = "demo";

/** Start een sync met de productieconfiguratie uit de omgevingsvariabelen. */
export async function startSync(trigger: "cron" | "handmatig") {
  const e = env();
  // Een omgevingsvariabele in Vercel gaat voor; anders de waarde uit de tabel `instellingen`.
  const inst = await laadInstellingen(db());
  return runSync({
    store: supabaseStore(db()),
    sem: createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY }),
    cash: createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY }),
    dryRun: e.SYNC_DRY_RUN,
    startDate: e.SYNC_START_DATE,
    cashInstellingen: {
      administratie: e.CASH_ADMINISTRATIE,
      dagboek: e.CASH_DAGBOEK || inst.cash_dagboek || "",
      debiteurenGrootboek: e.CASH_GB_DEBITEUREN || inst.cash_gb_debiteuren || "",
      kostenplaatsNegeren: inst.kostenplaatsen === "negeren",
    },
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
export async function herstelTestboeking(batchNumber: number, invoiceId: number) {
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
  const [dagboek, stuk] = String(data.cash_boeking_id ?? "").split(" ")[0].split("/");
  if (data.status === "geboekt" && dagboek && stuk) {
    const cash = createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY });
    const datum = String(data.factuurdatum);
    const oud = await stap("oude boeking lezen", () => cash.mutaties(TEST_ADMINISTRATIE, cashDatum(datum).slice(0, 4), dagboek, stuk));
    if (oud.length > 0) {
      const tegen = oud.map((m) => ({
        F0901: dagboek,
        F0302: cashDatum(datum),
        // CASH weigert een bestaand boekstuknummer; de correctie krijgt 9 + het oude nummer.
        F0303: `9${stuk.padStart(5, "0")}`,
        F0201: m.F0201,
        ...(m.F0101 ? { F0101: m.F0101 } : {}),
        F0306: `Correctie ${dagboek}/${stuk}`,
        F0307: cashBedrag(-Math.round(Number(String(m.F0307).replace(",", ".")) * 100)),
      }));
      await stap("tegenboeken", () => cash.importeerRecords(TEST_ADMINISTRATIE, tegen));
      tegengeboekt = tegen.length;
    }
  }

  const { error: e2 } = await sb
    .from("sem_facturen")
    .update({ status: "fout", foutmelding: `Testboeking ${data.cash_boeking_id ?? ""} tegengeboekt; opnieuw geboekt`, cash_boeking_id: null })
    .eq("sem_factuur_id", String(invoiceId));
  if (e2) throw new Error(e2.message);

  return { tegengeboekt, oudBoekstuk: data.cash_boeking_id, nieuw: await startTestboeking(batchNumber, invoiceId) };
}

/**
 * Echte testboeking van één SEM-factuur in de CASH-testadministratie "demo", ongeacht de
 * proefmodus. Weigert als de ingestelde administratie niet "demo" is: zo kan dit nooit in de
 * live boekhouding terechtkomen. Gebruikt verder exact dezelfde sync-logica als de nachtelijke run
 * (inclusief bescherming tegen dubbel boeken).
 */
export async function startTestboeking(batchNumber: number, invoiceId?: number) {
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
    dryRun: false,
    startDate: "2000-01-01",
    cashInstellingen: {
      administratie: TEST_ADMINISTRATIE,
      dagboek: e.CASH_DAGBOEK || inst.cash_dagboek || "",
      debiteurenGrootboek: e.CASH_GB_DEBITEUREN || inst.cash_gb_debiteuren || "",
      kostenplaatsNegeren: inst.kostenplaatsen === "negeren",
    },
    trigger: "handmatig",
  });
}
