import { naarRecords, type CashBoeking } from "@/lib/cash/client";
import type { SemFactuur } from "@/lib/sem/client";
import { euro } from "./format";

/** "1264,50" -> 126450 */
const centen = (bedrag: string) => Math.round(Number(bedrag.replace(",", ".")) * 100);

/** Factuurregels zoals SEM ze leverde, met de controle tegen het factuurtotaal. */
export function SemRegels({ sem }: { sem: SemFactuur }) {
  const btwRegels = sem.btwRegels ?? [];
  const somExcl = sem.regels.reduce((s, r) => s + r.bedragExclCents, 0);
  const somBtw = btwRegels.length > 0 ? btwRegels.reduce((s, r) => s + r.bedragCents, 0) : sem.regels.reduce((s, r) => s + r.btwCents, 0);
  return (
    <div className="tabel-wrap">
      <table>
        <caption className="sr-only">Factuurregels uit Smart Event Manager</caption>
        <thead>
          <tr>
            <th scope="col">Omschrijving</th>
            <th scope="col">Grootboek</th>
            <th scope="col">Btw-code</th>
            <th scope="col">Kostenplaats</th>
            <th scope="col" className="num">
              Excl. btw
            </th>
            <th scope="col" className="num">
              Btw
            </th>
            <th scope="col" className="num">
              Incl. btw
            </th>
          </tr>
        </thead>
        <tbody>
          {sem.regels.map((r, i) => (
            <tr key={i}>
              <td>{r.omschrijving}</td>
              <td>
                <code>{r.grootboek}</code>
              </td>
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
          {btwRegels.map((b, i) => (
            <tr key={`btw-${i}`}>
              <td className="muted">Btw-regel {b.btwCode}</td>
              <td>
                <code>{b.grootboek}</code>
              </td>
              <td>
                {b.btwCode}
                {b.btwPercentage != null ? ` (${b.btwPercentage}%)` : ""}
              </td>
              <td />
              <td />
              <td className="num">{euro(b.bedragCents)}</td>
              <td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>
              Som
            </th>
            <td className="num">{euro(somExcl)}</td>
            <td className="num">{euro(somBtw)}</td>
            <td className="num">{euro(somExcl + somBtw)}</td>
          </tr>
          <tr>
            <th scope="row" colSpan={4}>
              Factuurtotaal volgens SEM
            </th>
            <td className="num">{sem.totaalExclCents != null ? euro(sem.totaalExclCents) : "—"}</td>
            <td />
            <td className="num">{sem.totaalInclCents != null ? euro(sem.totaalInclCents) : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Boekregels (record 301) voor CASH, met saldo-controle. */
export function CashRegels({ boeking }: { boeking: CashBoeking }) {
  const records = naarRecords(boeking);
  const saldo = records.reduce((s, r) => s + centen(r.F0307), 0);
  return (
    <>
      <p className="toelichting">
        Administratie <code>{boeking.administratie}</code> · dagboek <code>{boeking.dagboek || "—"}</code> · boekdatum {boeking.boekdatum} · record 301
        (grootboekmutaties)
      </p>
      <div className="tabel-wrap">
        <table>
          <caption className="sr-only">Boekregels voor CASH</caption>
          <thead>
            <tr>
              <th scope="col">Grootboek</th>
              <th scope="col">Relatie</th>
              <th scope="col">Factuurnr</th>
              <th scope="col">Kostenplaats</th>
              <th scope="col">Omschrijving</th>
              <th scope="col" className="num">
                Debet
              </th>
              <th scope="col" className="num">
                Credit
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => {
              const c = centen(r.F0307);
              return (
                <tr key={i}>
                  <td>
                    <code>{r.F0201}</code>
                  </td>
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
              <th scope="row" colSpan={5}>
                Saldo (moet € 0,00 zijn)
              </th>
              <td colSpan={2} className="num" style={{ color: saldo === 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 650 }}>
                {euro(saldo)} {saldo === 0 ? "✓ sluitend" : "✗ niet sluitend"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <details className="uitklap">
        <summary>Ruwe data naar CASH (JSON)</summary>
        <pre>{JSON.stringify({ admin: boeking.administratie, format: 0, content: { cash: [{ R301: records }] } }, null, 2)}</pre>
      </details>
    </>
  );
}
