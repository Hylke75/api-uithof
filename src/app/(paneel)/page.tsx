import { AlertTriangle, BookOpen, CheckCircle2, Clock3, Database, FileText } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { StatusBanners } from "@/components/banners";
import { datum, tijd } from "@/components/format";
import { ControleerKnop, SyncKnop } from "@/components/knoppen";
import { Banner, InlineFout, Kaart, Kpi, Laden, Leeg, PageHeader, RunStatusPill } from "@/components/ui";
import { ProcesFlow, VerbindingKaarten } from "@/components/verbinding";
import { configuratie, factuurTelling, runs, type Configuratie } from "@/lib/dashboard/data";
import { verbindingen } from "@/lib/dashboard/verbindingen";

export const maxDuration = 300;

export default async function Overzicht() {
  const [config, telling] = await Promise.all([configuratie(), factuurTelling()]);
  const semHost = config.semUrl ? new URL(config.semUrl).host : "(niet ingesteld)";
  const uitleg = telling.ok ? undefined : "Niet beschikbaar";
  const t = telling.ok ? telling.data : null;

  return (
    <>
      <PageHeader
        eyebrow="Integratie"
        titel="Uithof facturensync"
        intro={
          <>
            Synchroniseert facturen van Smart Event Manager ({semHost}) naar CASH. Elke nacht om 01:00 UTC (03:00 Nederlandse zomertijd, 02:00
            wintertijd) worden de journaalpostbatches verwerkt die in SEM zijn aangemaakt.
          </>
        }
        acties={
          <>
            <SyncKnop proefmodus={config.proefmodus} />
            <ControleerKnop />
          </>
        }
      />

      <StatusBanners config={config} supabaseFout={telling.ok ? null : telling.fout} />

      <div className="raster raster-4" aria-label="Facturen per status">
        <Kpi toon="info" icoon={<FileText size={22} />} label="Totaal facturen" waarde={t?.totaal ?? null} uitleg={uitleg} href="/facturen" />
        <Kpi toon="warning" icoon={<Clock3 size={22} />} label="In verwerking / proef" waarde={t ? t.proef + t.nieuw : null} uitleg={uitleg} href="/facturen?status=proef" />
        <Kpi toon="success" icoon={<CheckCircle2 size={22} />} label="Geboekt" waarde={t?.geboekt ?? null} uitleg={uitleg} href="/facturen?status=geboekt" />
        <Kpi toon="danger" icoon={<AlertTriangle size={22} />} label="Fouten" waarde={t ? t.fout + t.gewijzigd_na_boeking : null} uitleg={uitleg} href="/facturen?status=fout" />
      </div>

      <Suspense fallback={<Laden hoogte={420} label="Verbindingen controleren" />}>
        <VerbindingenSectie config={config} />
      </Suspense>
    </>
  );
}

async function VerbindingenSectie({ config }: { config: Configuratie }) {
  const v = await verbindingen();
  const recent = await runs(5);
  const dagboek = config.dagboek.ok ? config.dagboek.data : "";

  return (
    <>
      <Kaart titel="Verbindingen" id="verbindingen" actie={<span className="toelichting">Gecontroleerd {tijd(v.gecontroleerdOp)}</span>}>
        <VerbindingKaarten v={v} />
        <div style={{ marginTop: 16 }}>
          <ProcesFlow v={v} config={config} />
        </div>
      </Kaart>

      <div className="raster raster-2">
        <Kaart titel="CASH administraties" id="adm" actie={<Link className="knop klein" href="/controle">Alle administraties</Link>}>
          {!v.cashAdministraties.ok ? (
            <InlineFout fout={v.cashAdministraties.fout} wat="Administraties" />
          ) : v.cashAdministraties.data.length === 0 ? (
            <Leeg>Geen administraties zichtbaar voor deze API-gebruiker.</Leeg>
          ) : (
            <div className="tabel-wrap scroll-lijst">
              <table>
                <caption className="sr-only">Administraties die de CASH-API-gebruiker kan zien</caption>
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Naam</th>
                    <th scope="col">Alleen lezen</th>
                  </tr>
                </thead>
                <tbody>
                  {v.cashAdministraties.data.map((a) => (
                    <tr key={a.code} className={a.code === v.administratie ? "gemarkeerd" : undefined}>
                      <td>
                        <code>{a.code}</code>
                        {a.code === v.administratie && <span className="sr-only"> (ingesteld)</span>}
                      </td>
                      <td>{a.naam}</td>
                      <td>{a.alleenLezen ? "Ja" : "Nee"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kaart>

        <Kaart titel={`CASH dagboeken in ${v.administratie || "—"}`} id="dagb" actie={<Link className="knop klein" href="/instellingen">Instellingen</Link>}>
          {!v.cashDagboeken.ok ? (
            <InlineFout fout={v.cashDagboeken.fout} wat="Dagboeken" />
          ) : v.cashDagboeken.data.length === 0 ? (
            <Leeg>Geen dagboeken gevonden.</Leeg>
          ) : (
            <div className="tabel-wrap scroll-lijst">
              <table>
                <caption className="sr-only">Dagboeken in de ingestelde CASH-administratie</caption>
                <thead>
                  <tr>
                    <th scope="col">Code</th>
                    <th scope="col">Naam</th>
                    <th scope="col">Soort</th>
                    <th scope="col">Rekening</th>
                  </tr>
                </thead>
                <tbody>
                  {v.cashDagboeken.data.map((d) => (
                    <tr key={d.code} className={d.code === dagboek ? "gemarkeerd" : undefined}>
                      <td>
                        <code>{d.code}</code>
                        {d.code === dagboek && <span className="sr-only"> (ingesteld verkoopdagboek)</span>}
                      </td>
                      <td>{d.naam}</td>
                      <td>{d.soort}</td>
                      <td>{d.rekening}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kaart>
      </div>

      <div className="raster raster-2">
        <Kaart
          titel={`CASH grootboekrekeningen in ${v.administratie || "—"}`}
          icoon={<Database size={20} aria-hidden />}
          id="gb"
          actie={
            <Link className="knop klein" href="/controle#grootboek">
              Bekijken
            </Link>
          }
        >
          {!v.cashGrootboek.ok ? (
            <InlineFout fout={v.cashGrootboek.fout} wat="Grootboekrekeningen" />
          ) : (
            <dl className="definities">
              <dt>Aantal rekeningen</dt>
              <dd>{v.cashGrootboek.data.length}</dd>
              <dt>Debiteurenrekening</dt>
              <dd>
                {config.debiteurenGrootboek.ok ? <code>{config.debiteurenGrootboek.data || "niet ingesteld"}</code> : "niet beschikbaar"}
                {config.debiteurenVoorschot.ok && config.debiteurenVoorschot.data && (
                  <>
                    {" "}
                    · voorschot <code>{config.debiteurenVoorschot.data}</code>
                  </>
                )}
              </dd>
              <dt>Verkoopdagboek</dt>
              <dd>{dagboek ? <code>{dagboek}</code> : <span className="muted">niet ingesteld</span>}</dd>
            </dl>
          )}
        </Kaart>

        <Kaart
          titel="Laatste runs"
          icoon={<BookOpen size={20} aria-hidden />}
          id="runs"
          actie={
            <Link className="knop klein" href="/runs">
              Alle runs
            </Link>
          }
        >
          {!recent.ok ? (
            <InlineFout fout={recent.fout} wat="Runs" />
          ) : recent.data.length === 0 ? (
            <Leeg>Er is nog geen synchronisatie uitgevoerd.</Leeg>
          ) : (
            <div className="tabel-wrap">
              <table>
                <caption className="sr-only">De vijf meest recente synchronisatieruns</caption>
                <thead>
                  <tr>
                    <th scope="col">Gestart</th>
                    <th scope="col">Resultaat</th>
                    <th scope="col" className="num">
                      Facturen
                    </th>
                    <th scope="col" className="num">
                      Batches
                    </th>
                    <th scope="col">Modus</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/runs#run-${r.id}`}>{tijd(r.started_at)}</Link>
                      </td>
                      <td>
                        <RunStatusPill status={r.status} />
                      </td>
                      <td className="num">{r.n_opgehaald}</td>
                      <td className="num">{r.n_batches}</td>
                      <td>{r.dry_run ? "proef" : "live"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kaart>
      </div>

      {v.sem.ok && v.sem.data.batches.length === 0 && (
        <Banner toon="info" titel={`Geen batches in SEM sinds ${datum(v.sem.data.sinds)}`}>
          Er staat in SEM geen journaalpostbatch die sinds de startdatum is aangemaakt of gewijzigd. Maak in SEM een batch aan, of bekijk oudere
          facturen via Voorbeeld per periode (menu Facturen).
        </Banner>
      )}
    </>
  );
}
