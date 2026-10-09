import Link from "next/link";
import { notFound } from "next/navigation";
import { naarRecords, type CashBoeking } from "@/lib/cash/client";
import type { SemFactuur } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import { euro, tijd } from "../../format";

export const dynamic = "force-dynamic";

/** "1264,50" -> 126450 */
const centen = (bedrag: string) => Math.round(Number(bedrag.replace(",", ".")) * 100);

export default async function Factuur({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: f, error } = await db().from("sem_facturen").select("*").eq("sem_factuur_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!f) notFound();

  const sem = f.sem_payload as SemFactuur;
  const boeking = f.cash_payload as CashBoeking | null;
  const records = boeking ? naarRecords(boeking) : [];
  const saldo = records.reduce((s, r) => s + centen(r.F0307), 0);
  const somExcl = sem.regels.reduce((s, r) => s + r.bedragExclCents, 0);
  const somBtw = sem.regels.reduce((s, r) => s + r.btwCents, 0);

  return (
    <main>
      <p>
        <Link href="/">← overzicht</Link>
      </p>
      <h1>
        {f.soort === "creditnota" ? "Creditnota" : "Factuur"} {f.factuurnummer}
      </h1>
      <p>
        <span className={`s-${f.status}`}>{f.status}</span> · factuurdatum {f.factuurdatum} · batch {f.sem_batch_number} · debiteur{" "}
        {f.sem_debiteurnummer} · SEM-InvoiceID {f.sem_factuur_id} · bijgewerkt {tijd(f.updated_at)}
        {f.cash_boeking_id ? ` · CASH: ${f.cash_boeking_id}` : ""}
      </p>
      {f.foutmelding && <div className="banner fout">{f.foutmelding}</div>}

      <h2>1. Uit Smart Event Manager</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Omschrijving</th>
              <th>Grootboek</th>
              <th>Btw-code</th>
              <th>Kostenplaats</th>
              <th className="num">Excl. btw</th>
              <th className="num">Btw</th>
              <th className="num">Incl. btw</th>
            </tr>
          </thead>
          <tbody>
            {sem.regels.map((r, i) => (
              <tr key={i}>
                <td>{r.omschrijving}</td>
                <td>{r.grootboek}</td>
                <td>
                  {r.btwCode}
                  {r.btwPercentage != null ? ` (${r.btwPercentage}%)` : ""}
                </td>
                <td>{r.kostenplaats}</td>
                <td className="num">{euro(r.bedragExclCents)}</td>
                <td className="num">{euro(r.btwCents)}</td>
                <td className="num">{euro(r.bedragExclCents + r.btwCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>Som van de regels</th>
              <th className="num">{euro(somExcl)}</th>
              <th className="num">{euro(somBtw)}</th>
              <th className="num">{euro(somExcl + somBtw)}</th>
            </tr>
            <tr>
              <th colSpan={4}>Factuurtotaal volgens SEM</th>
              <th className="num">{sem.totaalExclCents != null ? euro(sem.totaalExclCents) : "–"}</th>
              <th />
              <th className="num">{sem.totaalInclCents != null ? euro(sem.totaalInclCents) : "–"}</th>
            </tr>
          </tfoot>
        </table>
      </div>

      <h2>2. {f.status === "geboekt" ? "Geboekt in CASH" : "Wat er in CASH geboekt wordt"}</h2>
      {!boeking ? (
        <p className="muted">Nog geen boeking samengesteld (zie de melding hierboven).</p>
      ) : (
        <>
          <p className="muted">
            Administratie {boeking.administratie} · dagboek {boeking.dagboek} · boekdatum {boeking.boekdatum} · record 301 (grootboekmutaties)
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Grootboek (F0201)</th>
                  <th>Relatie (F0101)</th>
                  <th>Factuurnr (F0309)</th>
                  <th>Kostenplaats (F0911)</th>
                  <th>Omschrijving (F0306)</th>
                  <th className="num">Debet</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const c = centen(r.F0307);
                  return (
                    <tr key={i}>
                      <td>{r.F0201}</td>
                      <td>{r.F0101}</td>
                      <td>{r.F0309}</td>
                      <td>{r.F0911}</td>
                      <td>{r.F0306}</td>
                      <td className="num">{c > 0 ? euro(c) : ""}</td>
                      <td className="num">{c < 0 ? euro(-c) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={5}>Saldo (moet € 0,00 zijn)</th>
                  <th colSpan={2} className={`num ${saldo === 0 ? "s-success" : "s-failed"}`}>
                    {euro(saldo)}
                  </th>
                </tr>
              </tfoot>
            </table>
          </div>
          <details>
            <summary>Ruwe data naar CASH (JSON)</summary>
            <pre>{JSON.stringify({ admin: boeking.administratie, format: 0, content: { cash: [{ R301: records }] } }, null, 2)}</pre>
          </details>
        </>
      )}

      <details>
        <summary>Ruwe data uit SEM (JSON)</summary>
        <pre>{JSON.stringify(sem, null, 2)}</pre>
      </details>
    </main>
  );
}
