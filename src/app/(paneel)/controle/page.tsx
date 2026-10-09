import { tijd } from "@/components/format";
import { ControleerKnop } from "@/components/knoppen";
import { InlineFout, Kaart, Leeg, PageHeader } from "@/components/ui";
import { VerbindingKaarten } from "@/components/verbinding";
import { configuratie } from "@/lib/dashboard/data";
import { verbindingen } from "@/lib/dashboard/verbindingen";

export const maxDuration = 60;

/**
 * Alleen-lezende controle van Supabase, SEM en CASH: er worden geen facturen opgehaald voor
 * verwerking en er wordt niets geboekt.
 */
export default async function Controle() {
  const [v, config] = await Promise.all([verbindingen(), configuratie()]);
  const dagboek = config.dagboek.ok ? config.dagboek.data : "";

  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        titel="Verbindingen controleren"
        intro={<>Alleen lezen: er worden geen facturen opgehaald voor verwerking en er wordt niets geboekt. Laatste controle {tijd(v.gecontroleerdOp)}.</>}
        acties={<ControleerKnop label="Opnieuw controleren" />}
      />

      <Kaart titel="Status" id="status">
        <VerbindingKaarten v={v} />
      </Kaart>

      <div className="raster raster-2">
        <Kaart titel="Batches in Smart Event Manager" id="sem">
          {!v.sem.ok ? (
            <InlineFout fout={v.sem.fout} wat="Batches" />
          ) : v.sem.data.batches.length === 0 ? (
            <Leeg>Geen batches aangemaakt of gewijzigd sinds {v.sem.data.sinds}.</Leeg>
          ) : (
            <div className="tabel-wrap scroll-lijst">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col">Naam</th>
                    <th scope="col">Bedrijf</th>
                    <th scope="col">Aangemaakt</th>
                  </tr>
                </thead>
                <tbody>
                  {v.sem.data.batches.map((b) => (
                    <tr key={`${b.BatchNumber}-${b.CompanyCode}`}>
                      <td>{b.BatchNumber}</td>
                      <td>{b.Name}</td>
                      <td>{b.CompanyCode}</td>
                      <td>{b.CreatedAt ? tijd(b.CreatedAt) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kaart>

        <Kaart titel="CASH administraties" id="adm">
          {!v.cashAdministraties.ok ? (
            <InlineFout fout={v.cashAdministraties.fout} wat="Administraties" />
          ) : (
            <div className="tabel-wrap scroll-lijst">
              <table>
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
                        {a.code === v.administratie && " (ingesteld)"}
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
      </div>

      <div className="raster raster-2">
        <Kaart titel={`CASH dagboeken in ${v.administratie || "—"}`} id="dagboeken">
          {!v.cashDagboeken.ok ? (
            <InlineFout fout={v.cashDagboeken.fout} wat="Dagboeken" />
          ) : (
            <div className="tabel-wrap scroll-lijst">
              <table>
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
                        {d.code === dagboek && " (verkoopdagboek)"}
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

        <Kaart titel={`CASH grootboekrekeningen in ${v.administratie || "—"}`} id="grootboek">
          {!v.cashGrootboek.ok ? (
            <InlineFout fout={v.cashGrootboek.fout} wat="Grootboekrekeningen" />
          ) : (
            <div className="tabel-wrap scroll-lijst">
              <table>
                <caption className="sr-only">{v.cashGrootboek.data.length} grootboekrekeningen</caption>
                <thead>
                  <tr>
                    <th scope="col">Rekening</th>
                    <th scope="col">Omschrijving</th>
                    <th scope="col">OB-tarief</th>
                  </tr>
                </thead>
                <tbody>
                  {v.cashGrootboek.data.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <code>{r.rekening}</code>
                      </td>
                      <td>{r.omschrijving}</td>
                      <td>{r.obTarief}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kaart>
      </div>
    </>
  );
}
