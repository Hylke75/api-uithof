import { ChevronRight } from "lucide-react";
import { datum, tijd } from "@/components/format";
import { InlineFout, Kaart, Leeg, PageHeader, Pill, RunStatusPill } from "@/components/ui";
import { runs } from "@/lib/dashboard/data";

function duur(van: string, tot: string | null) {
  if (!tot) return "—";
  const s = Math.round((new Date(tot).getTime() - new Date(van).getTime()) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export default async function Runs() {
  const lijst = await runs(100);
  return (
    <>
      <PageHeader
        titel="Synchronisatieruns"
        intro="Elke synchronisatie (nachtelijk gepland of handmatig gestart). Een run in proefmodus verwerkt facturen maar boekt niets in CASH. De controle van verbindingen is geen run en staat hier niet."
      />
      <Kaart>
        {!lijst.ok ? (
          <InlineFout fout={lijst.fout} wat="Runs" />
        ) : lijst.data.length === 0 ? (
          <Leeg>Er is nog geen synchronisatie uitgevoerd.</Leeg>
        ) : (
          <div className="tabel-wrap">
            <table>
              <caption className="sr-only">Synchronisatieruns, nieuwste eerst</caption>
              <thead>
                <tr>
                  <th scope="col">Gestart</th>
                  <th scope="col">Duur</th>
                  <th scope="col">Resultaat</th>
                  <th scope="col">Modus</th>
                  <th scope="col">Trigger</th>
                  <th scope="col">Batches sinds</th>
                  <th scope="col" className="num">
                    Batches
                  </th>
                  <th scope="col" className="num">
                    Facturen
                  </th>
                  <th scope="col" className="num">
                    Geboekt
                  </th>
                  <th scope="col" className="num">
                    Proef
                  </th>
                  <th scope="col" className="num">
                    Overgeslagen
                  </th>
                  <th scope="col" className="num">
                    Fout
                  </th>
                  <th scope="col">Meldingen</th>
                </tr>
              </thead>
              <tbody>
                {lijst.data.map((r) => (
                  <tr key={r.id} id={`run-${r.id}`}>
                    <td>{tijd(r.started_at)}</td>
                    <td>{duur(r.started_at, r.finished_at)}</td>
                    <td>
                      <RunStatusPill status={r.status} />
                    </td>
                    <td>{r.dry_run ? <Pill toon="warning">Proef</Pill> : <Pill toon="info">Live</Pill>}</td>
                    <td>{r.trigger === "handmatig" ? "Handmatig" : "Gepland"}</td>
                    <td>{datum(r.window_from)}</td>
                    <td className="num">{r.n_batches}</td>
                    <td className="num">{r.n_opgehaald}</td>
                    <td className="num">{r.n_geboekt}</td>
                    <td className="num">{r.n_proef}</td>
                    <td className="num">{r.n_overgeslagen}</td>
                    <td className="num">{r.n_fout}</td>
                    <td className="melding">
                      {r.error ? (
                        <details className="uitklap">
                          <summary>
                            <ChevronRight className="chevron" size={16} aria-hidden /> {r.error.split("\n").length} melding(en)
                          </summary>
                          {r.error}
                          <br />
                          <span className="mono muted">run {r.id}</span>
                        </details>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>
    </>
  );
}
