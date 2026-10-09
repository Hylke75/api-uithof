import Link from "next/link";
import { tijd } from "@/components/format";
import { InlineFout, Kaart, Leeg, PageHeader, Pill } from "@/components/ui";
import { batches } from "@/lib/dashboard/data";

export default async function Batches() {
  const lijst = await batches();
  return (
    <>
      <PageHeader
        titel="Batches uit SEM"
        intro="Journaalpostbatches die de synchronisatie uit Smart Event Manager heeft opgehaald. Batches worden in SEM met de hand aangemaakt; via de API kunnen ze niet aangemaakt of als verwerkt gemarkeerd worden."
      />
      <Kaart>
        {!lijst.ok ? (
          <InlineFout fout={lijst.fout} wat="Batches" />
        ) : lijst.data.length === 0 ? (
          <Leeg>Nog geen batches opgehaald. Batches verschijnen hier na de eerste geslaagde synchronisatie.</Leeg>
        ) : (
          <div className="tabel-wrap">
            <table>
              <caption className="sr-only">Opgehaalde batches, laatst opgehaald eerst</caption>
              <thead>
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Naam</th>
                  <th scope="col">Aangemaakt in SEM</th>
                  <th scope="col">Eerst gezien</th>
                  <th scope="col">Laatst opgehaald</th>
                  <th scope="col" className="num">
                    Facturen
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Melding</th>
                </tr>
              </thead>
              <tbody>
                {lijst.data.map((b) => (
                  <tr key={`${b.batch_number}-${b.company_code}`}>
                    <td>
                      <Link href={`/facturen?batch=${b.batch_number}`}>
                        {b.batch_number}
                        {b.company_code ? ` (${b.company_code})` : ""}
                      </Link>
                    </td>
                    <td>{b.naam}</td>
                    <td>{b.sem_created_at ? tijd(b.sem_created_at) : <span className="muted">onbekend</span>}</td>
                    <td>{tijd(b.eerst_gezien_at)}</td>
                    <td>{tijd(b.laatst_opgehaald_at)}</td>
                    <td className="num">{b.n_facturen}</td>
                    <td>{b.fout ? <Pill toon="danger">Ophalen mislukt</Pill> : <Pill toon="success">Opgehaald</Pill>}</td>
                    <td className="breed muted">{b.fout}</td>
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
