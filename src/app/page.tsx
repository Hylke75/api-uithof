import Link from "next/link";
import { revalidatePath } from "next/cache";
import { env, ontbrekendeInstellingen } from "@/lib/env";
import { db } from "@/lib/supabase";
import { startSync } from "@/lib/sync";
import { euro, tijd } from "./format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handmatigeSync() {
  "use server";
  await startSync("handmatig");
  revalidatePath("/");
}

const STATUS_UITLEG: Record<string, string> = {
  proef: "proef (niet geboekt)",
  nieuw: "uitkomst onbekend",
  geboekt: "geboekt",
  fout: "fout",
  gewijzigd_na_boeking: "gewijzigd na boeking",
};

export default async function Beheer({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ontbreekt = ontbrekendeInstellingen();
  if (ontbreekt.length > 0) {
    return (
      <main>
        <h1>Uithof facturensync</h1>
        <div className="banner proef">De koppeling is nog niet volledig ingesteld. Er wordt niets opgehaald of geboekt.</div>
        <p>
          <Link href="/controle">Verbindingen controleren</Link>
        </p>
        <h2>Nog in te stellen (Vercel → Settings → Environment Variables)</h2>
        <ul>
          {ontbreekt.map((k) => (
            <li key={k}>
              <code>{k}</code>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const { status } = await searchParams;
  const sb = db();
  let factuurQuery = sb
    .from("sem_facturen")
    .select("sem_factuur_id, factuurnummer, factuurdatum, soort, sem_debiteurnummer, sem_batch_number, totaal_incl_cents, status, foutmelding, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status) factuurQuery = factuurQuery.eq("status", status);

  const [runs, facturen, batches, telling] = await Promise.all([
    sb.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(15),
    factuurQuery,
    sb.from("sem_batches").select("*").order("laatst_opgehaald_at", { ascending: false }).limit(20),
    sb.from("sem_facturen").select("status"),
  ]);

  const perStatus = new Map<string, number>();
  for (const r of telling.data ?? []) perStatus.set(r.status, (perStatus.get(r.status) ?? 0) + 1);
  const e = env();

  return (
    <main>
      <h1>Uithof facturensync</h1>
      <p className="muted">
        Smart Event Manager ({new URL(e.SEM_BASE_URL).host}) → CASH (administratie {e.CASH_ADMINISTRATIE}, dagboek {e.CASH_DAGBOEK}).
        Elke nacht om 01:00 UTC worden de journaalpostbatches verwerkt die in SEM zijn aangemaakt.
      </p>

      <div className={`banner ${e.SYNC_DRY_RUN ? "proef" : "live"}`}>
        {e.SYNC_DRY_RUN
          ? "Proefmodus: facturen worden opgehaald en omgezet, maar NIET in CASH geboekt. Klik op een factuur om te zien wat er geboekt zou worden."
          : "Live: facturen worden in CASH geboekt."}
      </div>

      <form action={handmatigeSync} className="acties">
        <button type="submit">Sync nu starten</button>
        <Link href="/controle">Verbindingen controleren</Link>
      </form>

      <h2>Facturen</h2>
      <p className="filters">
        <Link href="/" className={!status ? "actief" : ""}>alle ({telling.data?.length ?? 0})</Link>
        {Object.entries(STATUS_UITLEG).map(([s, label]) => (
          <Link key={s} href={`/?status=${s}`} className={`s-${s} ${status === s ? "actief" : ""}`}>
            {label} ({perStatus.get(s) ?? 0})
          </Link>
        ))}
      </p>
      {facturen.error ? (
        <p className="s-failed">Kon facturen niet laden: {facturen.error.message}</p>
      ) : facturen.data.length === 0 ? (
        <p className="muted">Nog geen facturen{status ? " met deze status" : ""}.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Factuur</th>
                <th>Datum</th>
                <th>Batch</th>
                <th>Debiteur</th>
                <th className="num">Bedrag incl.</th>
                <th>Status</th>
                <th>Melding</th>
              </tr>
            </thead>
            <tbody>
              {facturen.data.map((f) => (
                <tr key={f.sem_factuur_id}>
                  <td>
                    <Link href={`/factuur/${f.sem_factuur_id}`}>
                      {f.soort === "creditnota" ? "Credit " : ""}
                      {f.factuurnummer}
                    </Link>
                  </td>
                  <td>{f.factuurdatum}</td>
                  <td>{f.sem_batch_number}</td>
                  <td>{f.sem_debiteurnummer}</td>
                  <td className="num">{euro(f.totaal_incl_cents)}</td>
                  <td className={`s-${f.status}`}>{STATUS_UITLEG[f.status] ?? f.status}</td>
                  <td className="wrap">{f.foutmelding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Batches uit SEM</h2>
      {batches.error ? (
        <p className="s-failed">Kon batches niet laden: {batches.error.message}</p>
      ) : batches.data.length === 0 ? (
        <p className="muted">Nog geen batches opgehaald.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Naam</th>
                <th>Aangemaakt in SEM</th>
                <th className="num">Facturen</th>
                <th>Laatst opgehaald</th>
                <th>Melding</th>
              </tr>
            </thead>
            <tbody>
              {batches.data.map((b) => (
                <tr key={`${b.batch_number}-${b.company_code}`}>
                  <td>{b.batch_number}{b.company_code ? ` (${b.company_code})` : ""}</td>
                  <td>{b.naam}</td>
                  <td>{b.sem_created_at ? tijd(b.sem_created_at) : ""}</td>
                  <td className="num">{b.n_facturen}</td>
                  <td>{tijd(b.laatst_opgehaald_at)}</td>
                  <td className="wrap s-fout">{b.fout}</td>
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
                <th>Batches sinds</th>
                <th className="num">Batches</th>
                <th className="num">Facturen</th>
                <th className="num">Geboekt</th>
                <th className="num">Proef</th>
                <th className="num">Overgeslagen</th>
                <th className="num">Fout</th>
                <th>Meldingen</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td>{tijd(r.started_at)}</td>
                  <td className={`s-${r.status}`}>{r.status}</td>
                  <td>{r.dry_run ? "proef" : "live"}{r.trigger === "handmatig" ? " (handmatig)" : ""}</td>
                  <td>{r.window_from}</td>
                  <td className="num">{r.n_batches}</td>
                  <td className="num">{r.n_opgehaald}</td>
                  <td className="num">{r.n_geboekt}</td>
                  <td className="num">{r.n_proef}</td>
                  <td className="num">{r.n_overgeslagen}</td>
                  <td className="num">{r.n_fout}</td>
                  <td className="wrap pre">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
