import { leesEnv, ontbrekendeInstellingen } from "@/lib/env";
import { db } from "@/lib/supabase";
import { laadInstellingen } from "@/lib/sync/store";
import { probeer, redigeer, type Resultaat } from "./resultaat";

/** Leesfuncties voor het beheerpaneel. Alle data komt uit Supabase; niets wordt verzonnen. */

export const STATUSSEN = ["proef", "nieuw", "geboekt", "fout", "gewijzigd_na_boeking"] as const;
export type FactuurStatus = (typeof STATUSSEN)[number];

export const STATUS_LABEL: Record<string, string> = {
  proef: "Proef (niet geboekt)",
  nieuw: "Uitkomst onbekend",
  geboekt: "Geboekt",
  fout: "Fout",
  gewijzigd_na_boeking: "Gewijzigd na boeking",
};

export interface Configuratie {
  proefmodus: boolean;
  semUrl: string;
  semKeyIngesteld: boolean;
  cashUrl: string;
  cashKeyIngesteld: boolean;
  administratie: string;
  dagboek: Resultaat<string>;
  debiteurenGrootboek: Resultaat<string>;
  debiteurenVoorschot: Resultaat<string>;
  startDatum: string;
  supabaseUrl: string;
  ontbrekend: string[];
}

/** Configuratie zoals de server die ziet; sleutels alleen als "ingesteld ja/nee". */
export async function configuratie(): Promise<Configuratie> {
  const inst = await probeer(() => laadInstellingen(db()));
  const uitInst = (envNaam: string, sleutel: string): Resultaat<string> => {
    const env = leesEnv(envNaam);
    if (env) return { ok: true, data: env };
    if (!inst.ok) return inst;
    return { ok: true, data: inst.data[sleutel] ?? "" };
  };
  return {
    proefmodus: leesEnv("SYNC_DRY_RUN") !== "false",
    semUrl: leesEnv("SEM_BASE_URL") ?? "",
    semKeyIngesteld: !!leesEnv("SEM_API_KEY"),
    cashUrl: leesEnv("CASH_BASE_URL") ?? "https://www.cashweb.nl/api/4.0",
    cashKeyIngesteld: !!leesEnv("CASH_API_KEY"),
    administratie: leesEnv("CASH_ADMINISTRATIE") ?? "",
    dagboek: uitInst("CASH_DAGBOEK", "cash_dagboek"),
    debiteurenGrootboek: uitInst("CASH_GB_DEBITEUREN", "cash_gb_debiteuren"),
    debiteurenVoorschot: uitInst("CASH_GB_DEBITEUREN_VOORSCHOT", "cash_gb_debiteuren_voorschot"),
    startDatum: leesEnv("SYNC_START_DATE") ?? "",
    supabaseUrl: (leesEnv("SUPABASE_URL") ?? "").replace(/\/rest\/v1\/?$/, ""),
    ontbrekend: ontbrekendeInstellingen(),
  };
}

export type Telling = Record<FactuurStatus, number> & { totaal: number };

export function telPerStatus(rijen: { status: string }[]): Telling {
  const t = { totaal: rijen.length, proef: 0, nieuw: 0, geboekt: 0, fout: 0, gewijzigd_na_boeking: 0 } as Telling;
  for (const r of rijen) if (r.status in t) t[r.status as FactuurStatus]++;
  return t;
}

export function factuurTelling(): Promise<Resultaat<Telling>> {
  return probeer(async () => {
    const { data, error } = await db().from("sem_facturen").select("status");
    if (error) throw new Error(error.message);
    return telPerStatus(data ?? []);
  });
}

export interface FactuurRij {
  sem_factuur_id: string;
  factuurnummer: string;
  factuurdatum: string | null;
  soort: string;
  sem_debiteurnummer: string;
  sem_batch_number: number;
  totaal_incl_cents: number;
  status: string;
  foutmelding: string | null;
  updated_at: string;
}

export const PAGINA_GROOTTE = 50;

export function facturen(opts: { status?: string; zoek?: string; batch?: number; pagina?: number }): Promise<Resultaat<{ rijen: FactuurRij[]; totaal: number }>> {
  return probeer(async () => {
    const pagina = Math.max(1, opts.pagina ?? 1);
    let q = db()
      .from("sem_facturen")
      .select("sem_factuur_id, factuurnummer, factuurdatum, soort, sem_debiteurnummer, sem_batch_number, totaal_incl_cents, status, foutmelding, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range((pagina - 1) * PAGINA_GROOTTE, pagina * PAGINA_GROOTTE - 1);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.batch != null) q = q.eq("sem_batch_number", opts.batch);
    if (opts.zoek) {
      const z = opts.zoek.replace(/[%,()]/g, "");
      q = q.or(`factuurnummer.ilike.%${z}%,sem_debiteurnummer.ilike.%${z}%`);
    }
    const { data, error, count } = await q;
    if (error) throw new Error(error.message);
    return { rijen: (data ?? []) as FactuurRij[], totaal: count ?? 0 };
  });
}

export interface RunRij {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  dry_run: boolean;
  trigger: string;
  window_from: string;
  window_to: string;
  n_batches: number;
  n_opgehaald: number;
  n_geboekt: number;
  n_proef: number;
  n_overgeslagen: number;
  n_fout: number;
  error: string | null;
}

export function runs(limiet = 50): Promise<Resultaat<RunRij[]>> {
  return probeer(async () => {
    const { data, error } = await db().from("sync_runs").select("*").order("started_at", { ascending: false }).limit(limiet);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...r, error: r.error ? redigeer(r.error) : null })) as RunRij[];
  });
}

export interface BatchRij {
  batch_number: number;
  company_code: string;
  naam: string | null;
  sem_created_at: string | null;
  n_facturen: number;
  fout: string | null;
  eerst_gezien_at: string;
  laatst_opgehaald_at: string;
}

export function batches(): Promise<Resultaat<BatchRij[]>> {
  return probeer(async () => {
    const { data, error } = await db().from("sem_batches").select("*").order("laatst_opgehaald_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as BatchRij[];
  });
}

export interface MappingOverzicht {
  btw: { sem_btw_code: string; cash_btw_grootboek: string; omschrijving: string | null }[];
  grootboek: { sem_grootboek: string; grootboekrekening: string; omschrijving: string | null; actief: boolean }[];
  debiteur: { sem_debiteurnummer: string; cash_debiteurnummer: string; naam: string | null }[];
}

export function mappingOverzicht(): Promise<Resultaat<MappingOverzicht>> {
  return probeer(async () => {
    const [btw, gb, deb] = await Promise.all([
      db().from("map_btwcode").select("sem_btw_code, cash_btw_grootboek, omschrijving").order("sem_btw_code"),
      db().from("map_grootboek").select("sem_grootboek, grootboekrekening, omschrijving, actief").order("sem_grootboek"),
      db().from("map_debiteur").select("sem_debiteurnummer, cash_debiteurnummer, naam").order("sem_debiteurnummer"),
    ]);
    for (const r of [btw, gb, deb]) if (r.error) throw new Error(r.error.message);
    return { btw: btw.data ?? [], grootboek: gb.data ?? [], debiteur: deb.data ?? [] } as MappingOverzicht;
  });
}

export type Niveau = "fout" | "waarschuwing" | "info";
export interface LogRegel {
  tijd: string;
  niveau: Niveau;
  bron: "run" | "batch" | "factuur";
  bericht: string;
  context: string;
  runId: string | null;
}

/**
 * Logboek samengesteld uit wat de sync vastlegt: meldingen per run, fouten per batch en
 * foutmeldingen per factuur. Er is geen aparte logtabel.
 */
export function logboek(): Promise<Resultaat<LogRegel[]>> {
  return probeer(async () => {
    const [r, b, f] = await Promise.all([
      db().from("sync_runs").select("id, started_at, status, error, dry_run, trigger").order("started_at", { ascending: false }).limit(100),
      db().from("sem_batches").select("batch_number, fout, laatst_opgehaald_at, laatste_run_id").not("fout", "is", null).limit(100),
      db()
        .from("sem_facturen")
        .select("factuurnummer, status, foutmelding, updated_at, laatste_run_id")
        .not("foutmelding", "is", null)
        .order("updated_at", { ascending: false })
        .limit(200),
    ]);
    for (const x of [r, b, f]) if (x.error) throw new Error(x.error.message);
    const regels: LogRegel[] = [];
    for (const run of r.data ?? []) {
      const ctx = `${run.dry_run ? "proef" : "live"}, ${run.trigger}`;
      regels.push({
        tijd: run.started_at,
        niveau: run.status === "failed" ? "fout" : run.status === "partial" ? "waarschuwing" : "info",
        bron: "run",
        bericht: `Run ${run.status}`,
        context: ctx,
        runId: run.id,
      });
      for (const m of (run.error ?? "").split("\n").filter(Boolean)) {
        regels.push({ tijd: run.started_at, niveau: run.status === "failed" ? "fout" : "waarschuwing", bron: "run", bericht: redigeer(m), context: ctx, runId: run.id });
      }
    }
    for (const bt of b.data ?? []) {
      regels.push({ tijd: bt.laatst_opgehaald_at, niveau: "fout", bron: "batch", bericht: redigeer(bt.fout ?? ""), context: `batch ${bt.batch_number}`, runId: bt.laatste_run_id });
    }
    for (const fa of f.data ?? []) {
      regels.push({
        tijd: fa.updated_at,
        niveau: fa.status === "fout" || fa.status === "gewijzigd_na_boeking" ? "fout" : "waarschuwing",
        bron: "factuur",
        bericht: redigeer(fa.foutmelding ?? ""),
        context: `factuur ${fa.factuurnummer} (${STATUS_LABEL[fa.status] ?? fa.status})`,
        runId: fa.laatste_run_id,
      });
    }
    return regels.sort((a, b2) => b2.tijd.localeCompare(a.tijd));
  });
}
