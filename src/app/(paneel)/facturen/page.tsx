import { Search } from "lucide-react";
import Link from "next/link";
import { StatusBanners } from "@/components/banners";
import { datum, euro, tijd } from "@/components/format";
import { FactuurStatusPill, InlineFout, Kaart, Leeg, PageHeader } from "@/components/ui";
import { configuratie, facturen, factuurTelling, PAGINA_GROOTTE, STATUS_LABEL, STATUSSEN } from "@/lib/dashboard/data";

type Params = { status?: string; zoek?: string; batch?: string; pagina?: string };

function href(p: Params) {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
  const s = q.toString();
  return s ? `/facturen?${s}` : "/facturen";
}

export default async function Facturen({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const status = STATUSSEN.includes(sp.status as never) ? sp.status : undefined;
  const batch = sp.batch && /^\d+$/.test(sp.batch) ? Number(sp.batch) : undefined;
  const pagina = sp.pagina && /^\d+$/.test(sp.pagina) ? Number(sp.pagina) : 1;
  const zoek = sp.zoek?.trim() || undefined;

  const [config, telling, lijst] = await Promise.all([configuratie(), factuurTelling(), facturen({ status, zoek, batch, pagina })]);
  const t = telling.ok ? telling.data : null;
  const basis = { zoek, batch: batch?.toString() };
  const paginas = lijst.ok ? Math.max(1, Math.ceil(lijst.data.totaal / PAGINA_GROOTTE)) : 1;

  return (
    <>
      <PageHeader
        titel="Facturen"
        intro="Alle facturen die uit SEM zijn opgehaald, met de status van de boeking in CASH. Klik op een factuur voor de bron, de mapping en de (voorgenomen) CASH-boeking."
        acties={
          <Link className="knop" href="/voorbeeld">
            Voorbeeld per periode
          </Link>
        }
      />
      <StatusBanners config={config} supabaseFout={lijst.ok ? null : lijst.fout} />

      <Kaart>
        <div className="werkbalk">
          <nav className="filters" aria-label="Filter op status">
            <Link className="filter" href={href({ ...basis })} aria-current={!status ? "true" : undefined}>
              Alle {t && <span className="aantal">({t.totaal})</span>}
            </Link>
            {STATUSSEN.map((s) => (
              <Link key={s} className="filter" href={href({ ...basis, status: s })} aria-current={status === s ? "true" : undefined}>
                {STATUS_LABEL[s]} {t && <span className="aantal">({t[s]})</span>}
              </Link>
            ))}
          </nav>
          <form className="acties" role="search" action="/facturen">
            {status && <input type="hidden" name="status" value={status} />}
            <label className="veld">
              Zoeken op factuur- of debiteurnummer
              <input type="search" name="zoek" defaultValue={zoek} placeholder="bijv. 10319" />
            </label>
            <label className="veld">
              Batch
              <input type="text" inputMode="numeric" name="batch" defaultValue={batch} style={{ width: 90 }} />
            </label>
            <button className="knop" type="submit" style={{ alignSelf: "flex-end" }}>
              <Search size={16} aria-hidden /> Zoeken
            </button>
          </form>
        </div>

        {!lijst.ok ? (
          <InlineFout fout={lijst.fout} wat="Facturen" />
        ) : lijst.data.rijen.length === 0 ? (
          <Leeg>Geen facturen gevonden voor deze filters.</Leeg>
        ) : (
          <>
            <div className="tabel-wrap">
              <table>
                <caption className="sr-only">Facturen, nieuwste wijziging eerst</caption>
                <thead>
                  <tr>
                    <th scope="col">Factuur</th>
                    <th scope="col">Datum</th>
                    <th scope="col">Debiteur</th>
                    <th scope="col" className="num">
                      Bedrag incl.
                    </th>
                    <th scope="col">Batch</th>
                    <th scope="col">Status</th>
                    <th scope="col">Laatst verwerkt</th>
                    <th scope="col">Melding</th>
                  </tr>
                </thead>
                <tbody>
                  {lijst.data.rijen.map((f) => (
                    <tr key={f.sem_factuur_id}>
                      <td>
                        <Link href={`/facturen/${f.sem_factuur_id}`}>
                          {f.soort === "creditnota" ? "Creditnota " : ""}
                          {f.factuurnummer}
                        </Link>
                      </td>
                      <td>{datum(f.factuurdatum)}</td>
                      <td>{f.sem_debiteurnummer}</td>
                      <td className="num">{euro(f.totaal_incl_cents)}</td>
                      <td>
                        <Link href={href({ batch: String(f.sem_batch_number) })}>{f.sem_batch_number}</Link>
                      </td>
                      <td>
                        <FactuurStatusPill status={f.status} />
                      </td>
                      <td>{tijd(f.updated_at)}</td>
                      <td className="breed muted">{f.foutmelding}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="paginering" aria-label="Paginering">
              <span>
                {lijst.data.totaal} facturen · pagina {pagina} van {paginas}
              </span>
              {pagina > 1 && (
                <Link className="knop klein" href={href({ ...basis, status, pagina: String(pagina - 1) })}>
                  Vorige
                </Link>
              )}
              {pagina < paginas && (
                <Link className="knop klein" href={href({ ...basis, status, pagina: String(pagina + 1) })}>
                  Volgende
                </Link>
              )}
            </nav>
          </>
        )}
      </Kaart>
    </>
  );
}
