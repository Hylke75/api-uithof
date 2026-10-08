# Uithof facturensync (SEM → CASH)

Elke nacht worden de journaalpostbatches uit **Smart Event Manager (SEM)** opgehaald en in **CASH**
geboekt. Dit vervangt de handmatige import in CASH.

- **Vercel** (Next.js/TypeScript): nachtelijke cron (`vercel.json`, 01:00 UTC) en een beheerpagina
- **Supabase**: logboek van runs, batches, facturenhistorie en mappingtabellen
- **GitHub**: versiebeheer

> **Status:** de SEM-koppeling is gebouwd op basis van de API-documentatie en getest met nagebootste
> antwoorden. Hij moet nog gecontroleerd worden met echte data uit de testomgeving (`npm run sem:verken`).
> De CASH-koppeling is nog een *stub*. De **proefmodus staat standaard aan**.

## Werkwijze voor De Uithof

1. Een medewerker maakt in SEM met de hand een journaalpostbatch aan. Via de API kan dat niet.
2. 's Nachts haalt de sync alle batches op die sinds de vorige run zijn aangemaakt of gewijzigd.
3. De facturen uit die batches worden in CASH geboekt. Elke factuur wordt maar één keer geboekt.

## Hoe een run werkt

1. **Batches ophalen:** `GetJournalEntryBatches` met `FromModifiedAt` = de vorige run min 7 dagen,
   maar nooit vóór `SYNC_START_DATE`. Bij de eerste run is dat `SYNC_START_DATE`.
2. **Per batch:** `GetJournalEntries` (journaalposten) en `GetInvoices` (factuurkoppen met totalen) ophalen.
3. **Facturen samenstellen** (`src/lib/sem/facturen.ts`):
   - De journaalposten worden per `InvoiceID` gegroepeerd.
   - Omzetregels zijn de posten met een `InvoiceLineID`. Credit telt als omzet (+) en debet als
     correctie of creditnota (−). Het bedrag excl. btw is `BaseAmount`, de btw is `TaxAmount`.
   - De som van de regels moet aansluiten op `TotalAmountEx` en `TotalAmountIn` uit de factuurkop,
     met een marge van 1 cent. Sluit het niet aan, dan wordt de factuur **niet** geboekt.
4. **Per factuur:**
   - **Factuurdatum vóór `SYNC_START_DATE`:** overslaan, want die factuur zit al via de handmatige import in CASH.
   - **Al geboekt en ongewijzigd:** overslaan.
   - **Al geboekt, maar in SEM gewijzigd:** de status wordt `gewijzigd_na_boeking`, voor handmatige controle.
   - **Probleem of ontbrekende mapping:** de status wordt `fout`, met een melding. De volgende run probeert het opnieuw.
   - **Proefmodus:** de status wordt `proef`. De boeking die naar CASH *zou* gaan, wordt opgeslagen in `cash_payload`.
   - **Live:** eerst wordt de status `nieuw` vastgelegd, daarna wordt er geboekt in CASH, en dan wordt de status `geboekt`.
     Stopt een run halverwege, dan blijft de status `nieuw` staan en wordt de factuur **niet** automatisch opnieuw geboekt.
5. **Resultaat:** komt in `sync_runs` (`success`, `partial` of `failed`, met de meldingen erbij) en per batch in `sem_batches`.

## Mapping

| Tabel | Wat | Verplicht? |
|---|---|---|
| `map_btwcode` | SEM-btw-code (bijv. `Hoog`) → CASH-btw-code | **Ja**, voor elke gebruikte code. Een lege code heeft sleutel `''` |
| `map_grootboek` | SEM-grootboek → CASH-grootboek | Nee. Zonder rij wordt het nummer 1-op-1 overgenomen |
| `map_debiteur` | SEM-debiteurnummer → CASH-debiteurnummer | Nee. Zonder rij wordt het nummer 1-op-1 overgenomen |

`npm run sem:verken` laat zien welke btw-codes en grootboekrekeningen in een batch voorkomen.

## Statussen van facturen

| Status | Betekenis |
|---|---|
| `proef` | Gemapt in proefmodus, niet geboekt |
| `nieuw` | Boeking gestart, maar de uitkomst is onbekend. Controleer dit in CASH |
| `geboekt` | Geboekt in CASH (`cash_boeking_id`) |
| `fout` | Probleem, mapping- of CASH-fout. Zie `foutmelding` |
| `gewijzigd_na_boeking` | Gewijzigd in SEM nadat de factuur geboekt is. Handmatig afhandelen |

## Lokaal ontwikkelen

```bash
npm install
cp .env.example .env.local   # vul de waarden in
npm test                     # unit tests
npm run typecheck
npm run sem:verken -- 2026-09-01      # bekijk batches/journaalposten uit SEM (alleen lezen)
npm run sem:verken -- 2026-09-01 41   # batch 41 in detail
npm run dev                  # beheerpagina op http://localhost:3000
```

Database: voer `supabase/migrations/*.sql` uit op het Supabase-project, met `supabase db push` of via de SQL-editor.

Handmatig een cron-run starten:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
```

## SEM-API

- Documentatie: https://support.smarteventmanager.com/api/html/f7c1ff93-5b8d-58b2-9591-29eb62b8c1cb.htm (overzicht van controllers)
- Authenticatie: header `ApiKey: <key>`. Er is één key per SEM-omgeving.
- Omgevingen:
  - De Uithof: `https://deuithof.smarteventmanager.com`
  - Test (Connector-licentie): `https://apidemo.smarteventmanager.com`
- Gebruikte endpoints. SEM documenteert GET met een body, maar staat POST toe; wij gebruiken POST.
  - `api/JournalEntryBatches/GetJournalEntryBatches`: `{ JournalEntryBatchFilter: { FromModifiedAt } }` → `JournalEntryBatches[]`
  - `api/JournalEntries/GetJournalEntries`: `{ JournalEntryFilter: { BatchNumber, CompanyCode? } }` → `JournalEntries[]`
  - `api/Invoices/GetInvoices`: `{ InvoiceFilter: { BatchNumbers, CompanyCodes? }, InvoiceLoadOptions }` → `Invoices[]`
- Beperkingen:
  - Batches worden altijd met de hand aangemaakt en kunnen niet als verwerkt gemarkeerd worden.
  - Er is geen vaste rate limit. Houd het aantal aanroepen redelijk, want de omgeving wordt gedeeld.
- Betalingen terugzetten kan later via `api/Invoices/AddInvoicePayments`
  (`InvoiceID` of `InvoiceNumber`, `Amount`, `PaymentDateTime`, `PaymentRegisterID`).

## CASH

- Het account `hylke@linkandlead.nl` (Sporttainment Center De Uithof B.V.) is een
  **API-gebruiker**, maar heeft nog **geen administratie gekoppeld**. Zonder koppeling geeft
  elke aanroep de fout `1002 Unauthorized Access`. Een beheerder van De Uithof (of de accountant)
  moet de administratie koppelen via Gebruikersbeheer.
- **CASH API 3.0** is SOAP/XML met genummerde aanvragen en records. Er bestaat ook een **API 4.0 (REST)**.
  Die heeft de voorkeur als hij verkoopboekingen ondersteunt.
- De CASH-koppeling zit achter de interface `CashClient` (`src/lib/cash/client.ts`). Of het
  SOAP of REST wordt, verandert dus niets aan de sync-logica.

## Beveiliging

- API-keys en wachtwoorden staan alleen in de omgevingsvariabelen (Vercel / `.env.local`), nooit in de repo.
- De beheerpagina zit achter HTTP Basic Auth (`ADMIN_USER` / `ADMIN_PASSWORD`).
- De cron-route accepteert alleen `Authorization: Bearer $CRON_SECRET`. Vercel stuurt die header automatisch mee.
- Supabase: RLS staat aan zonder policies. Alleen de server, met de service role key, heeft toegang.

## Naar live

1. Laat de parallel-run in proefmodus draaien. Vergelijk `cash_payload` met de handmatige import.
2. Laat de contactpersoon van De Uithof akkoord geven.
3. Stel `SYNC_START_DATE` in op de eerste factuurdatum die *niet* meer handmatig geïmporteerd wordt.
   Anders worden facturen dubbel geboekt.
4. Zet `SYNC_DRY_RUN=false` en `CASH_ADMINISTRATIE` op de productieadministratie.

## Openstaande punten

- [ ] SEM: de omzetting controleren met echte journaalposten uit de testomgeving (`npm run sem:verken`)
- [ ] SEM: de btw-codes en grootboekrekeningen van De Uithof in de mapping zetten
- [ ] CASH: administratie van De Uithof koppelen aan de API-gebruiker
- [ ] CASH: API 4.0 (REST)-documentatie of WSDL en recordindeling opvragen bij CASH-support, en de `CashClient` bouwen
- [ ] CASH: debiteuren. Bestaan de SEM-debiteurnummers al in CASH, of moeten nieuwe debiteuren aangemaakt worden (via SEM `GetRelation`)?
- [ ] CASH: is er een duplicaatcontrole op factuurnummer? Zo is een time-out veilig af te handelen
- [ ] Startdatum: eerste factuurdatum die niet meer handmatig in CASH komt
- [ ] Betalingen uit CASH terugzetten in SEM (`AddInvoicePayments`): gewenst?
- [ ] Supabase-organisatie (kosten) en contactpersoon De Uithof voor de parallel-run
