import Link from "next/link";
import { createSemClient } from "@/lib/sem/client";
import { leesEnv } from "@/lib/env";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Controleert alleen-lezend de verbindingen met Supabase, SEM en CASH, zodat je zonder
 * scripts kunt zien of de sleutels en administratie kloppen. Er wordt niets geboekt.
 */

const CASH_HEADERS = { Accept: "*/*", "Content-Type": "application/json;charset=UTF-8", "Cache-Control": "no-cache", "Sec-Fetch-Mode": "cors" };

async function cashGet(pad: string) {
  const base = (leesEnv("CASH_BASE_URL") || "https://www.cashweb.nl/api/4.0").replace(/\/+$/, "");
  const res = await fetch(`${base}${pad}`, {
    headers: { ...CASH_HEADERS, Authorization: leesEnv("CASH_API_KEY") ?? "" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  const tekst = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${tekst.slice(0, 200)}`);
  return JSON.parse(tekst);
}

const rijen = (x: unknown): Record<string, string>[] => (x == null ? [] : Array.isArray(x) ? x : Object.values(x as object));

async function probeer<T>(f: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; fout: string }> {
  try {
    return { ok: true, data: await f() };
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : String(e) };
  }
}

function Resultaat({ titel, r, children }: { titel: string; r: { ok: boolean; fout?: string }; children?: React.ReactNode }) {
  return (
    <section>
      <h2>
        <span className={r.ok ? "s-success" : "s-failed"}>{r.ok ? "✓" : "✗"}</span> {titel}
      </h2>
      {r.ok ? children : <p className="s-failed">{r.fout}</p>}
    </section>
  );
}

export default async function Controle() {
  const admin = leesEnv("CASH_ADMINISTRATIE") ?? "";
  const sinds = leesEnv("SYNC_START_DATE") ?? "2026-01-01";

  const [supa, batches, adms, dagboeken, grootboek] = await Promise.all([
    probeer(async () => {
      const { count, error } = await db().from("sync_runs").select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    }),
    probeer(() => createSemClient({ baseUrl: leesEnv("SEM_BASE_URL") ?? "", apiKey: leesEnv("SEM_API_KEY") ?? "" }).fetchBatches(sinds)),
    probeer(() => cashGet("/administrations")),
    probeer(() => cashGet(`/get/index/0901?admin=${encodeURIComponent(admin)}`)),
    probeer(() => cashGet(`/get/index/0201?admin=${encodeURIComponent(admin)}`)),
  ]);

  const admLijst = adms.ok ? rijen(adms.data?.Dir?.Adms?.Adm) : [];
  const adminGevonden = admLijst.some((a) => a.Code === admin);

  return (
    <main>
      <p>
        <Link href="/">← overzicht</Link>
      </p>
      <h1>Verbindingen controleren</h1>
      <p className="muted">Alleen lezen: er wordt niets opgehaald voor verwerking en niets geboekt.</p>

      <Resultaat titel="Supabase (database)" r={supa}>
        <p>Verbonden; {supa.ok ? supa.data : 0} runs in het logboek.</p>
      </Resultaat>

      <Resultaat titel={`Smart Event Manager (${leesEnv("SEM_BASE_URL") ?? "?"})`} r={batches}>
        {batches.ok && (
          <>
            <p>{batches.data.length} batch(es) aangemaakt of gewijzigd sinds {sinds}.</p>
            {batches.data.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Batch</th>
                      <th>Naam</th>
                      <th>Bedrijf</th>
                      <th>Aangemaakt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.data.slice(-20).map((b) => (
                      <tr key={`${b.BatchNumber}-${b.CompanyCode}`}>
                        <td>{b.BatchNumber}</td>
                        <td>{b.Name}</td>
                        <td>{b.CompanyCode}</td>
                        <td>{b.CreatedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Resultaat>

      <Resultaat titel="CASH: administraties" r={adms}>
        <p className={adminGevonden ? "s-success" : "s-failed"}>
          Ingestelde administratie <code>{admin || "(leeg)"}</code> {adminGevonden ? "is beschikbaar." : "staat NIET in deze lijst."}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Naam</th>
                <th>Alleen lezen</th>
              </tr>
            </thead>
            <tbody>
              {admLijst.map((a) => (
                <tr key={a.Code}>
                  <td>{a.Code}</td>
                  <td>{a.Name}</td>
                  <td>{a.ReadOnly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Resultaat>

      <Resultaat titel={`CASH: dagboeken in ${admin}`} r={dagboeken}>
        <p className="muted">
          Ingesteld verkoopdagboek: <code>{leesEnv("CASH_DAGBOEK") ?? "(leeg; zie instellingen)"}</code>
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Naam</th>
                <th>Soort</th>
                <th>Rekening</th>
              </tr>
            </thead>
            <tbody>
              {(dagboeken.ok ? rijen(dagboeken.data?.R0901) : []).map((d, i) => (
                <tr key={i}>
                  <td>{d.F0901}</td>
                  <td>{d.F0902}</td>
                  <td>{d.F0903}</td>
                  <td>{d.F0201}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Resultaat>

      <Resultaat titel={`CASH: grootboekrekeningen in ${admin}`} r={grootboek}>
        <p className="muted">
          Ingestelde debiteurenrekening: <code>{leesEnv("CASH_GB_DEBITEUREN") ?? "1300 (uit instellingen)"}</code>
        </p>
        <details>
          <summary>{grootboek.ok ? rijen(grootboek.data?.R0201).length : 0} rekeningen tonen</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rekening</th>
                  <th>Omschrijving</th>
                  <th>OB-tarief</th>
                </tr>
              </thead>
              <tbody>
                {(grootboek.ok ? rijen(grootboek.data?.R0201) : []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.F0201}</td>
                    <td>{r.F0203}</td>
                    <td>{r.F0242}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Resultaat>
    </main>
  );
}
