import { StatusBanners } from "@/components/banners";
import { datum } from "@/components/format";
import { InlineFout, Kaart, Leeg, PageHeader, Pill } from "@/components/ui";
import { configuratie, mappingOverzicht } from "@/lib/dashboard/data";
import type { Resultaat } from "@/lib/dashboard/resultaat";

function Waarde({ r, leeg = "niet ingesteld" }: { r: Resultaat<string>; leeg?: string }) {
  if (!r.ok) return <span className="muted">niet beschikbaar ({r.fout})</span>;
  return r.data ? <code>{r.data}</code> : <Pill toon="warning">{leeg}</Pill>;
}

function Sleutel({ ingesteld }: { ingesteld: boolean }) {
  return ingesteld ? <Pill toon="success">ingesteld (verborgen)</Pill> : <Pill toon="danger">ontbreekt</Pill>;
}

export default async function Instellingen() {
  const [config, mapping] = await Promise.all([configuratie(), mappingOverzicht()]);

  return (
    <>
      <PageHeader
        titel="Instellingen"
        intro="Alleen lezen. Sleutels worden nooit getoond. Sleutels en adressen staan in Vercel (Settings → Environment Variables); boekhoudinstellingen en mappings staan in Supabase."
      />
      <StatusBanners config={config} supabaseFout={mapping.ok ? null : mapping.fout} />

      <div className="raster raster-2">
        <Kaart titel="Bron: Smart Event Manager" id="sem">
          <dl className="definities">
            <dt>Omgeving</dt>
            <dd>{config.semUrl || <Pill toon="danger">niet ingesteld</Pill>}</dd>
            <dt>API-key</dt>
            <dd>
              <Sleutel ingesteld={config.semKeyIngesteld} />
            </dd>
            <dt>Batches vanaf</dt>
            <dd>{config.startDatum ? datum(config.startDatum) : <Pill toon="danger">niet ingesteld</Pill>}</dd>
          </dl>
        </Kaart>

        <Kaart titel="Doel: CASH" id="cash">
          <dl className="definities">
            <dt>API</dt>
            <dd>{config.cashUrl}</dd>
            <dt>API-key</dt>
            <dd>
              <Sleutel ingesteld={config.cashKeyIngesteld} />
            </dd>
            <dt>Administratiecode</dt>
            <dd>{config.administratie ? <code>{config.administratie}</code> : <Pill toon="danger">niet ingesteld</Pill>}</dd>
            <dt>Verkoopdagboek</dt>
            <dd>
              <Waarde r={config.dagboek} leeg="Verkoopdagboek nog niet ingesteld" />
            </dd>
            <dt>Debiteurenrekening</dt>
            <dd>
              <Waarde r={config.debiteurenGrootboek} />
            </dd>
            <dt>Debiteuren voorschot</dt>
            <dd>
              <Waarde r={config.debiteurenVoorschot} />
            </dd>
          </dl>
          <p className="toelichting">
            De debiteurenrekening per factuur komt uit de debiteurregel van SEM (bijv. 1300 of 1320); de ingestelde rekening is de terugval.
          </p>
        </Kaart>

        <Kaart titel="Opslag: Supabase" id="supa">
          <dl className="definities">
            <dt>Project</dt>
            <dd>{config.supabaseUrl || <Pill toon="danger">niet ingesteld</Pill>}</dd>
            <dt>Service-sleutel</dt>
            <dd>{mapping.ok ? <Pill toon="success">werkt (verborgen)</Pill> : <Pill toon="danger">werkt niet</Pill>}</dd>
          </dl>
        </Kaart>

        <Kaart titel="Schema en modus" id="schema">
          <dl className="definities">
            <dt>Planning</dt>
            <dd>Elke nacht om 01:00 UTC (03:00 zomertijd, 02:00 wintertijd), via Vercel Cron</dd>
            <dt>Modus</dt>
            <dd>{config.proefmodus ? <Pill toon="warning">Proefmodus: niets wordt in CASH geboekt</Pill> : <Pill toon="info">Live: facturen worden geboekt</Pill>}</dd>
          </dl>
          <p className="toelichting">De modus wordt op de server bepaald (SYNC_DRY_RUN in Vercel) en is hier bewust niet te wijzigen.</p>
        </Kaart>
      </div>

      <Kaart titel="Mapping SEM → CASH" id="mapping">
        {!mapping.ok ? (
          <InlineFout fout={mapping.fout} wat="Mapping" />
        ) : (
          <div className="raster raster-3">
            <div>
              <h3>Btw-code → btw-rekening</h3>
              {mapping.data.btw.length === 0 ? (
                <Leeg>Geen afwijkingen: de btw-rekening uit SEM wordt gebruikt.</Leeg>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">SEM</th>
                      <th scope="col">CASH</th>
                      <th scope="col">Omschrijving</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.data.btw.map((r) => (
                      <tr key={r.sem_btw_code}>
                        <td>{r.sem_btw_code || "(leeg)"}</td>
                        <td>
                          <code>{r.cash_btw_grootboek}</code>
                        </td>
                        <td>{r.omschrijving}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3>Grootboek</h3>
              {mapping.data.grootboek.length === 0 ? (
                <Leeg>Geen afwijkingen: rekeningnummers gaan 1-op-1 over.</Leeg>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">SEM</th>
                      <th scope="col">CASH</th>
                      <th scope="col">Actief</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.data.grootboek.map((r) => (
                      <tr key={r.sem_grootboek}>
                        <td>{r.sem_grootboek}</td>
                        <td>
                          <code>{r.grootboekrekening}</code>
                        </td>
                        <td>{r.actief ? "Ja" : "Nee"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3>Debiteur</h3>
              {mapping.data.debiteur.length === 0 ? (
                <Leeg>Geen afwijkingen: debiteurnummers gaan 1-op-1 over.</Leeg>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">SEM</th>
                      <th scope="col">CASH</th>
                      <th scope="col">Naam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapping.data.debiteur.map((r) => (
                      <tr key={r.sem_debiteurnummer}>
                        <td>{r.sem_debiteurnummer}</td>
                        <td>
                          <code>{r.cash_debiteurnummer}</code>
                        </td>
                        <td>{r.naam}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Kaart>
    </>
  );
}
