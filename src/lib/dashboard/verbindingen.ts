import { leesEnv } from "@/lib/env";
import { createSemClient, type SemBatch } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import { probeer, type Resultaat } from "./resultaat";

/**
 * Alleen-lezende controles van Supabase, SEM en CASH. Er wordt niets opgehaald voor verwerking
 * en niets geboekt. Resultaat wordt kort per server-instantie bewaard, zodat niet elke
 * paginaweergave de externe API's belast; "Verbindingen controleren" wist deze cache.
 */

const CASH_HEADERS = { Accept: "*/*", "Content-Type": "application/json;charset=UTF-8", "Cache-Control": "no-cache", "Sec-Fetch-Mode": "cors" };
const CACHE_MS = 60_000;

async function cashGet(pad: string) {
  const base = (leesEnv("CASH_BASE_URL") ?? "https://www.cashweb.nl/api/4.0").replace(/\/+$/, "");
  const key = leesEnv("CASH_API_KEY");
  if (!key) throw new Error("CASH_API_KEY is niet ingesteld");
  const res = await fetch(`${base}${pad}`, {
    headers: { ...CASH_HEADERS, Authorization: key },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const tekst = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${tekst.slice(0, 200)}`);
  return JSON.parse(tekst);
}

/** CASH geeft lijsten als { "0": {...}, "1": {...} } of als array. */
const rijen = (x: unknown): Record<string, string>[] => (x == null ? [] : Array.isArray(x) ? x : Object.values(x as object));

export interface Administratie {
  code: string;
  naam: string;
  alleenLezen: boolean;
}
export interface Dagboek {
  code: string;
  naam: string;
  soort: string;
  rekening: string;
}
export interface Grootboekrekening {
  rekening: string;
  omschrijving: string;
  obTarief: string;
}

export interface Verbindingen {
  gecontroleerdOp: string;
  supabase: Resultaat<{ runs: number }>;
  sem: Resultaat<{ url: string; sinds: string; batches: SemBatch[] }>;
  cashAdministraties: Resultaat<Administratie[]>;
  cashDagboeken: Resultaat<Dagboek[]>;
  cashGrootboek: Resultaat<Grootboekrekening[]>;
  administratie: string;
}

async function controleer(): Promise<Verbindingen> {
  const administratie = leesEnv("CASH_ADMINISTRATIE") ?? "";
  const sinds = leesEnv("SYNC_START_DATE") ?? "2026-01-01";
  const semUrl = leesEnv("SEM_BASE_URL") ?? "";
  const q = `?admin=${encodeURIComponent(administratie)}`;

  const [supabase, sem, cashAdministraties, cashDagboeken, cashGrootboek] = await Promise.all([
    probeer(async () => {
      const { count, error } = await db().from("sync_runs").select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return { runs: count ?? 0 };
    }),
    probeer(async () => {
      const key = leesEnv("SEM_API_KEY");
      if (!key) throw new Error("SEM_API_KEY is niet ingesteld");
      const batches = await createSemClient({ baseUrl: semUrl, apiKey: key }).fetchBatches(sinds);
      return { url: semUrl, sinds, batches };
    }),
    probeer(async () =>
      rijen((await cashGet("/administrations"))?.Dir?.Adms?.Adm).map((a) => ({
        code: a.Code,
        naam: a.Name,
        alleenLezen: a.ReadOnly === "J" || a.ReadOnly === "Y",
      })),
    ),
    probeer(async () =>
      rijen((await cashGet(`/get/index/0901${q}`))?.R0901).map((d) => ({ code: d.F0901, naam: d.F0902, soort: d.F0903, rekening: d.F0201 ?? "" })),
    ),
    probeer(async () =>
      rijen((await cashGet(`/get/index/0201${q}`))?.R0201).map((r) => ({ rekening: r.F0201, omschrijving: r.F0203, obTarief: r.F0242 ?? "" })),
    ),
  ]);

  return { gecontroleerdOp: new Date().toISOString(), supabase, sem, cashAdministraties, cashDagboeken, cashGrootboek, administratie };
}

let cache: { tijd: number; waarde: Promise<Verbindingen> } | undefined;

export function verbindingen(): Promise<Verbindingen> {
  if (!cache || Date.now() - cache.tijd > CACHE_MS) cache = { tijd: Date.now(), waarde: controleer() };
  return cache.waarde;
}

export function wisVerbindingenCache() {
  cache = undefined;
}
