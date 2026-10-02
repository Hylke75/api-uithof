import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { db } from "@/lib/supabase";
import { startSync } from "@/lib/sync";

export const dynamic = "force-dynamic";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const tijd = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });

async function handmatigeSync() {
  "use server";
  await startSync("handmatig");
  revalidatePath("/");
}

export default async function Beheer() {
  const sb = db();
  const [runs, problemen] = await Promise.all([
    sb.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(20),
    sb
      .from("sem_facturen")
      .select("factuurnummer, factuurdatum, sem_debiteur_id, totaal_incl_cents, status, foutmelding")
      .in("status", ["fout", "gewijzigd_na_boeking", "nieuw"])
      .order("factuurdatum", { ascending: false })
      .limit(100),
  ]);

  const dryRun = env().SYNC_DRY_RUN;

  return (
    <main>
      <h1>Uithof facturensync</h1>
      <p className="muted">Smart Event Manager → CASH, elke nacht om 01:00 UTC.</p>

      <div className={`banner ${dryRun ? "proef" : "live"}`}>
        {dryRun
          ? "Proefmodus: facturen worden opgehaald en gemapt, maar niet in CASH geboekt."
          : "Live: facturen worden in CASH geboekt."}
      </div>

      <form action={handmatigeSync}>
        <button type="submit">Sync nu starten</button>
      </form>

      <h2>Aandachtspunten</h2>
      {problemen.error ? (
        <p className="s-failed">Kon facturen niet laden: {problemen.error.message}</p>
      ) : problemen.data.length === 0 ? (
        <p className="muted">Geen facturen die aandacht nodig hebben.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Factuur</th>
                <th>Datum</th>
                <th>Debiteur (SEM)</th>
                <th className="num">Bedrag incl.</th>
                <th>Status</th>
                <th>Melding</th>
              </tr>
            </thead>
            <tbody>
              {problemen.data.map((f) => (
                <tr key={f.factuurnummer}>
                  <td>{f.factuurnummer}</td>
                  <td>{f.factuurdatum}</td>
                  <td>{f.sem_debiteur_id}</td>
                  <td className="num">{euro.format(f.totaal_incl_cents / 100)}</td>
                  <td className={`s-${f.status}`}>{f.status}</td>
                  <td className="wrap">{f.foutmelding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Laatste runs</h2>
      {runs.error ? (
        <p className="s-failed">Kon runs niet laden: {runs.error.message}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gestart</th>
                <th>Status</th>
                <th>Modus</th>
                <th>Venster</th>
                <th className="num">Opgehaald</th>
                <th className="num">Geboekt</th>
                <th className="num">Proef</th>
                <th className="num">Overgeslagen</th>
                <th className="num">Fout</th>
                <th>Melding</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td>{tijd.format(new Date(r.started_at))}</td>
                  <td className={`s-${r.status}`}>{r.status}</td>
                  <td>{r.dry_run ? "proef" : "live"}{r.trigger === "handmatig" ? " (handmatig)" : ""}</td>
                  <td>{r.window_from} – {r.window_to}</td>
                  <td className="num">{r.n_opgehaald}</td>
                  <td className="num">{r.n_geboekt}</td>
                  <td className="num">{r.n_proef}</td>
                  <td className="num">{r.n_overgeslagen}</td>
                  <td className="num">{r.n_fout}</td>
                  <td className="wrap">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
