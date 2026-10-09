import Link from "next/link";
import { naarRecords } from "@/lib/cash/client";
import { leesEnv } from "@/lib/env";
import { createSemClient, type SemBatch, type SemFactuur } from "@/lib/sem/client";
import { bouwFacturen } from "@/lib/sem/facturen";
import { db } from "@/lib/supabase";
import { mapFactuur, type Mappings } from "@/lib/sync/mapping";
import { laadInstellingen, supabaseStore } from "@/lib/sync/store";
import { euro } from "../format";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Voorbeeld voor een gekozen periode: haalt batches en facturen uit SEM op en laat zien wat er
 * naar CASH zou gaan. Alleen lezen: er wordt niets opgeslagen en niets geboekt.
 */

const MAX_BATCHES = 25;
const isDatum = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const plusDagen = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const centen = (bedrag: string) => Math.round(Number(bedrag.replace(",", ".")) * 100);

export default async function Voorbeeld({ searchParams }: { searchParams: Promise<{ van?: string; tot?: string }> }) {
  const sp = await searchParams;
  const van = isDatum(sp.van) ? sp.van! : "2025-10-01";
  const tot = isDatum(sp.tot) ? sp.tot! : "2025-10-31";

  // Mapping en instellingen uit Supabase; lukt dat niet, dan tonen we het voorbeeld zonder mapping.
  let mappings: Mappings = { grootboek: new Map(), btwGrootboek: new Map(), debiteur: new Map() };
  let inst: Record<string, string> = {};
  let mappingFout: string | null = null;
  try {
    mappings = await supabaseStore(db()).laadMappings();
    inst = await laadInstellingen(db());
  } catch (e) {
    mappingFout = e instanceof Error ? e.message : String(e);
  }
  const cashInstellingen = {
    administratie: leesEnv("CASH_ADMINISTRATIE") ?? "",
    dagboek: leesEnv("CASH_DAGBOEK") ?? inst.cash_dagboek ?? "",
    debiteurenGrootboek: leesEnv("CASH_GB_DEBITEUREN") ?? inst.cash_gb_debiteuren ?? "",
  };

  let fout: string | null = null;
  let batches: SemBatch[] = [];
  let teVeel = false;
  const facturen: SemFactuur[] = [];
  const meldingen: string[] = [];
  try {
    const sem = createSemClient({ baseUrl: leesEnv("SEM_BASE_URL") ?? "", apiKey: leesEnv("SEM_API_KEY") ?? "" });
    // Batches gewijzigd sinds het begin van de periode, aangemaakt tot een maand na het eind
    // (facturen worden vaak pas later in een batch gezet).
    const alle = await sem.fetchBatches(van);
    batches = alle.filter((b) => !b.CreatedAt || b.CreatedAt.slice(0, 10) <= plusDagen(tot, 31));
    teVeel = batches.length > MAX_BATCHES;
    batches = batches.slice(-MAX_BATCHES);
    for (const b of batches) {
      const [posten, koppen] = await Promise.all([sem.fetchJournaalposten(b), sem.fetchFacturen(b)]);
      const r = bouwFacturen(b, posten, koppen);
      meldingen.push(...r.batchProblemen);
      facturen.push(...r.facturen.filter((f) => f.factuurdatum >= van && f.factuurdatum <= tot));
    }
  } catch (e) {
    fout = e instanceof Error ? e.message : String(e);
  }
  facturen.sort((a, b) => a.factuurdatum.localeCompare(b.factuurdatum) || a.factuurnummer.localeCompare(b.factuurnummer));

  const resultaten = facturen.map((f) => ({ f, m: mapFactuur(f, mappings, cashInstellingen) }));
  const nOk = resultaten.filter((r) => r.m.ok).length;
  const totaal = facturen.reduce((s, f) => s + (f.totaalInclCents ?? 0), 0);

  return (
    <main>
      <p>
        <Link href="/">← overzicht</Link>
      </p>
      <h1>Voorbeeld per periode</h1>
      <p className="muted">
        Haalt facturen uit SEM ({leesEnv("SEM_BASE_URL")}) en laat zien wat er naar CASH zou gaan. Alleen lezen: er wordt niets
        opgeslagen en niets geboekt.
      </p>
      <form className="acties" method="get">
        <label>
          Van <input type="date" name="van" defaultValue={van} />
        </label>
        <label>
          Tot en met <input type="date" name="tot" defaultValue={tot} />
        </label>
        <button type="submit">Tonen</button>
      </form>

      {mappingFout && <div className="banner fout">Mapping uit Supabase niet geladen ({mappingFout}); voorbeeld zonder btw-/grootboekmapping.</div>}
      {fout && <div className="banner fout">SEM: {fout}</div>}
      {teVeel && <div className="banner proef">Meer dan {MAX_BATCHES} batches gevonden; alleen de laatste {MAX_BATCHES} zijn bekeken. Kies een kortere periode.</div>}
      {meldingen.length > 0 && <div className="banner proef">{meldingen.join(" · ")}</div>}

      {!fout && (
        <p>
          {batches.length} batch(es) bekeken · {facturen.length} facturen met factuurdatum {van} t/m {tot} · totaal {euro(totaal)} ·{" "}
          <span className="s-success">{nOk} klaar om te boeken</span> ·{" "}
          <span className={nOk < facturen.length ? "s-failed" : ""}>{facturen.length - nOk} met een probleem</span>
        </p>
      )}

      {resultaten.map(({ f, m }) => {
        const records = m.ok ? naarRecords(m.boeking) : [];
        return (
          <details key={f.id}>
            <summary>
              <span className={m.ok ? "s-success" : "s-failed"}>{m.ok ? "✓" : "✗"}</span> {f.soort === "creditnota" ? "Creditnota" : "Factuur"}{" "}
              {f.factuurnummer} · {f.factuurdatum} · debiteur {f.debiteurnummer} · batch {f.batchNumber} · {euro(f.totaalInclCents ?? 0)}
              {!m.ok && <span className="s-failed"> — {m.fouten.join("; ")}</span>}
            </summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SEM: omschrijving</th>
                    <th>Grootboek</th>
                    <th>Btw-code</th>
                    <th>Kostenplaats</th>
                    <th className="num">Excl.</th>
                    <th className="num">Btw</th>
                  </tr>
                </thead>
                <tbody>
                  {f.regels.map((r, i) => (
                    <tr key={i}>
                      <td>{r.omschrijving}</td>
                      <td>{r.grootboek}</td>
                      <td>{r.btwCode}</td>
                      <td>{r.kostenplaats}</td>
                      <td className="num">{euro(r.bedragExclCents)}</td>
                      <td className="num">{euro(r.btwCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {m.ok && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>CASH: grootboek</th>
                      <th>Relatie</th>
                      <th>Factuurnr</th>
                      <th>Kostenplaats</th>
                      <th>Omschrijving</th>
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
                </table>
              </div>
            )}
          </details>
        );
      })}
    </main>
  );
}
