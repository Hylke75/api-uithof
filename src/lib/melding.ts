import { redigeer } from "@/lib/dashboard/resultaat";
import { leesEnv } from "@/lib/env";
import { db } from "@/lib/supabase";
import { datumNL, type SyncResultaat } from "@/lib/sync/run";
import { laadInstellingen } from "@/lib/sync/store";

/**
 * E-mailmeldingen na een nachtelijke run, via Resend:
 * - bij een fout (run mislukt of een factuur met een fout): altijd direct een foutmail;
 * - anders een dagelijkse samenvatting, zolang de datum in `melding_dagelijks_tot` niet voorbij is.
 * Ontvanger en einddatum staan in de tabel `instellingen`; de sleutel in RESEND_API_KEY.
 * Zonder sleutel of ontvanger wordt er niets verstuurd (de sync gaat altijd door).
 */

const DASHBOARD = "https://api-uithof.vercel.app";
const AFZENDER = "Uithof facturensync <sync@linkandlead.nl>";

export type SoortMelding = "fout" | "samenvatting" | null;

/** Welke mail hoort bij deze run. Een fout gaat altijd voor. */
export function welkeMelding(r: Pick<SyncResultaat, "status" | "n_fout">, vandaag: string, dagelijksTot?: string): SoortMelding {
  if (r.status === "failed" || r.n_fout > 0) return "fout";
  if (dagelijksTot && vandaag <= dagelijksTot) return "samenvatting";
  return null;
}

/** Verstuurt de mail; geeft terug wat er gebeurd is ("verstuurd" of de reden van niet). */
async function verstuur(aan: string, onderwerp: string, tekst: string): Promise<string> {
  const sleutel = leesEnv("RESEND_API_KEY");
  if (!sleutel) {
    console.warn("Melding niet verstuurd: RESEND_API_KEY ontbreekt.");
    return "niet verstuurd: RESEND_API_KEY ontbreekt";
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${sleutel}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: AFZENDER, to: aan.split(",").map((a) => a.trim()), subject: onderwerp, text: redigeer(tekst) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return "verstuurd";
  console.error(`Melding niet verstuurd: Resend HTTP ${res.status}`);
  return `niet verstuurd: Resend HTTP ${res.status}`;
}

/** Facturen uit deze run die aandacht nodig hebben. */
async function probleemFacturen(runId: string): Promise<string[]> {
  const { data } = await db()
    .from("sem_facturen")
    .select("factuurnummer, status, foutmelding")
    .eq("laatste_run_id", runId)
    .in("status", ["fout", "nieuw", "gewijzigd_na_boeking"])
    .order("factuurnummer")
    .limit(50);
  return (data ?? []).map((f) => `- Factuur ${f.factuurnummer} (${f.status}): ${f.foutmelding ?? ""}`);
}

function tellingen(r: SyncResultaat): string {
  return [
    `Batches: ${r.n_batches}`,
    `Facturen opgehaald: ${r.n_opgehaald}`,
    `Geboekt in CASH: ${r.n_geboekt}`,
    `Overgeslagen (al in CASH of vóór de overstap): ${r.n_overgeslagen}`,
    `Met een fout: ${r.n_fout}`,
    ...(r.n_proef ? [`Proef (niet geboekt): ${r.n_proef}`] : []),
  ].join("\n");
}

/**
 * Stuurt zo nodig een mail over deze run en geeft terug wat er gebeurd is (null = geen mail nodig).
 * Gooit nooit: een mislukte mail mag de sync niet raken.
 */
export async function meldRun(r: SyncResultaat): Promise<string | null> {
  try {
    const inst = await laadInstellingen(db());
    const aan = inst.melding_aan;
    if (!aan) return "niet verstuurd: geen ontvanger (instelling melding_aan)";
    const soort = welkeMelding(r, datumNL(new Date()), inst.melding_dagelijks_tot);
    if (!soort) return null;

    if (soort === "fout") {
      const facturen = await probleemFacturen(r.runId);
      return `foutmail ${await verstuur(
        aan,
        `Facturensync: ${r.status === "failed" ? "run mislukt" : `${r.n_fout} fout(en)`} (${r.windowTo})`,
        [
          "Bij de nachtelijke synchronisatie van SEM naar CASH is iets misgegaan.",
          "",
          tellingen(r),
          ...(r.meldingen.length ? ["", "Meldingen:", ...r.meldingen.map((m) => `- ${m}`)] : []),
          ...(facturen.length ? ["", "Facturen:", ...facturen] : []),
          "",
          `Bekijk de details: ${DASHBOARD}/runs`,
        ].join("\n"),
      )}`;
    }
    return `samenvatting ${await verstuur(
      aan,
      `Facturensync: ${r.n_geboekt} geboekt, alles in orde (${r.windowTo})`,
      ["De nachtelijke synchronisatie van SEM naar CASH is goed verlopen.", "", tellingen(r), "", `Dashboard: ${DASHBOARD}`].join("\n"),
    )}`;
  } catch (e) {
    const fout = redigeer(e instanceof Error ? e.message : String(e));
    console.error("Melding mislukt:", fout);
    return `niet verstuurd: ${fout}`;
  }
}

/** Mail als de sync niet eens kon starten. */
export async function meldStartFout(melding: string): Promise<void> {
  try {
    const inst = await laadInstellingen(db()).catch(() => ({}) as Record<string, string>);
    const aan = inst.melding_aan || leesEnv("MELDING_AAN");
    if (!aan) return;
    await verstuur(aan, "Facturensync: sync kon niet starten", `De nachtelijke synchronisatie kon niet starten:\n\n${melding}\n\n${DASHBOARD}/controle`);
  } catch (e) {
    console.error("Melding mislukt:", redigeer(e instanceof Error ? e.message : String(e)));
  }
}
