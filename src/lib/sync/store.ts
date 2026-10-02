import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mappings } from "./mapping";

export type FactuurStatus = "nieuw" | "proef" | "geboekt" | "fout" | "gewijzigd_na_boeking";
export type RunStatus = "running" | "success" | "partial" | "failed";

export interface RunTellingen {
  n_opgehaald: number;
  n_geboekt: number;
  n_proef: number;
  n_overgeslagen: number;
  n_fout: number;
}

export interface FactuurRow {
  sem_factuur_id: string;
  factuurnummer: string;
  factuurdatum: string;
  soort: "factuur" | "creditnota";
  sem_debiteur_id: string;
  totaal_excl_cents: number;
  totaal_btw_cents: number;
  totaal_incl_cents: number;
  sem_payload: unknown;
  content_hash: string;
  status: FactuurStatus;
  cash_boeking_id?: string | null;
  cash_payload?: unknown;
  foutmelding?: string | null;
  laatste_run_id: string;
  geboekt_at?: string | null;
}

export interface BestaandeFactuur {
  status: FactuurStatus;
  content_hash: string;
}

/** Opslaglaag van de sync; los van Supabase zodat de logica testbaar is. */
export interface SyncStore {
  laatsteVoltooideRun(): Promise<{ window_to: string } | null>;
  startRun(run: { dry_run: boolean; trigger: "cron" | "handmatig"; window_from: string; window_to: string }): Promise<string>;
  finishRun(id: string, patch: Partial<RunTellingen> & { status: RunStatus; error?: string | null }): Promise<void>;
  bestaandeFacturen(semIds: string[]): Promise<Map<string, BestaandeFactuur>>;
  /** Alleen status-velden bijwerken, bv. bij een wijziging na boeking. */
  markeerFactuur(semId: string, patch: { status: FactuurStatus; foutmelding: string; laatste_run_id: string }): Promise<void>;
  upsertFactuur(row: FactuurRow): Promise<void>;
  laadMappings(): Promise<Mappings>;
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function supabaseStore(sb: SupabaseClient): SyncStore {
  return {
    async laatsteVoltooideRun() {
      const data = check(
        await sb
          .from("sync_runs")
          .select("window_to")
          .in("status", ["success", "partial"])
          .order("window_to", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      return data;
    },

    async startRun(run) {
      const data = check(await sb.from("sync_runs").insert(run).select("id").single());
      return data!.id as string;
    },

    async finishRun(id, patch) {
      check(await sb.from("sync_runs").update({ ...patch, finished_at: new Date().toISOString() }).eq("id", id));
    },

    async bestaandeFacturen(semIds) {
      const result = new Map<string, BestaandeFactuur>();
      // In blokken, om de URL-lengte van de query binnen de perken te houden.
      for (let i = 0; i < semIds.length; i += 200) {
        const data = check(
          await sb
            .from("sem_facturen")
            .select("sem_factuur_id, status, content_hash")
            .in("sem_factuur_id", semIds.slice(i, i + 200)),
        );
        for (const r of data ?? []) result.set(r.sem_factuur_id, { status: r.status, content_hash: r.content_hash });
      }
      return result;
    },

    async markeerFactuur(semId, patch) {
      check(
        await sb
          .from("sem_facturen")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("sem_factuur_id", semId),
      );
    },

    async upsertFactuur(row) {
      check(
        await sb
          .from("sem_facturen")
          .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "sem_factuur_id" }),
      );
    },

    async laadMappings() {
      const omzet = check(
        await sb.from("map_omzetsoort").select("sem_omzetsoort, grootboekrekening, btw_code, kostenplaats, actief"),
      );
      const deb = check(await sb.from("map_debiteur").select("sem_debiteur_id, cash_debiteurnummer"));
      return {
        omzetsoort: new Map(
          (omzet ?? []).map((r) => [
            r.sem_omzetsoort,
            { grootboekrekening: r.grootboekrekening, btwCode: r.btw_code, kostenplaats: r.kostenplaats, actief: r.actief },
          ]),
        ),
        debiteur: new Map((deb ?? []).map((r) => [r.sem_debiteur_id, r.cash_debiteurnummer])),
      };
    },
  };
}
