# Uithof facturensync (SEM → CASH)

Elke nacht worden de journaalpostbatches uit **Smart Event Manager (SEM)** opgehaald en in **CASH**
geboekt (dagboek VERKS). Dit vervangt de handmatige import in CASH.

- **Vercel** (Next.js/TypeScript): nachtelijke cron (`vercel.json`, 01:00 UTC) en een beheerpagina
- **Supabase**: logboek van runs, batches, facturenhistorie, instellingen en mappingtabellen
- **GitHub**: versiebeheer

## Werkwijze voor De Uithof

1. Een medewerker journaliseert wekelijks (maandag/dinsdag) in SEM: dat maakt een batch aan. Via de API kan dat niet.
2. De nacht erna haalt de sync de nieuwe batch op en boekt de facturen in CASH. Elke factuur wordt maar één keer geboekt.
3. Op de beheerpagina is per run en per factuur te zien wat er geboekt is, en wat niet en waarom.

Een gejournaliseerde factuur kan in SEM niet meer veranderen.

## Beheerpaneel

Pagina's: Overzicht, Facturen (+ detail en Voorbeeld per periode), Batches, Runs, Instellingen, Logboek en
Verbindingen controleren. Alle gegevens komen uit Supabase/SEM/CASH; mislukt het ophalen, dan toont het paneel
een foutstatus en nooit nepnullen. "Sync nu starten" gebruikt dezelfde sync als de cron; of er echt geboekt wordt,
bepaalt de server (`SYNC_DRY_RUN`). Ontwerp volgens `design-brief/` (tokens in `src/app/globals.css`).

## Hoe een run werkt

1. **Batches ophalen:** `GetJournalEntryBatches` met `FromModifiedAt` = de vorige geslaagde run van dezelfde soort
   (proef of echt) min 7 dagen, nooit vóór `SYNC_START_DATE`. Bij een echte run komen ook batches met facturen die
   nog in de proefstand staan mee. Er kan maar één run tegelijk lopen (slot in de database).
2. **Per batch:** `GetJournalEntries` (journaalposten) en `GetInvoices` (factuurkoppen) ophalen.
3. **Facturen samenstellen** (`src/lib/sem/facturen.ts`), per `InvoiceID`:
   - `DEB`: debiteurregel, debet = totaal incl. btw, op de debiteurenrekening (1300 of 1320).
   - `OPB`, `KASSA`, `KOR`, `VERSCH`: omzetregels (credit = excl. btw, btw uit `TaxAmount`); `VERSCH` is het
     afrondingsverschil op 9999.
   - `BHO`/`BLA`: btw-regels (hoog 1701, laag 1702).
   - De journaalpost moet op nul sluiten en de btw op de regels moet aansluiten op de btw-regels
     (marge 1 cent per regel). Facturen van € 0,00 worden overgeslagen.
4. **Per factuur:**
   - **Vóór de overstap** (factuurnummer < `start_factuurnummer`, of factuurdatum < `SYNC_START_DATE`): overslaan,
     die staat al via de handmatige import in CASH.
   - **Al geboekt:** overslaan. **Probleem:** status `fout` met een melding; de volgende run probeert het opnieuw.
   - **Proefmodus:** status `proef`; de boeking die naar CASH *zou* gaan staat in `cash_payload`.
   - **Live:** eerst status `nieuw`, dan boeken, dan `geboekt`. Is de uitkomst onbekend (time-out, serverfout),
     dan blijft de status `nieuw` en wordt de factuur **niet** automatisch opnieuw geboekt.
5. **Resultaat:** in `sync_runs` (`success`, `partial` of `failed`, met meldingen) en per batch in `sem_batches`.

## Instellingen

| Waar | Wat |
|---|---|
| tabel `instellingen` | `cash_dagboek` (VERKS), `cash_gb_debiteuren` (1300, terugval), `start_factuurnummer` (823515) |
| `map_btwcode` | SEM-btw-code → CASH-btw-rekening, voor btw zonder aparte btw-regel |
| `map_grootboek` / `map_debiteur` | Optioneel: afwijkende rekening- of debiteurnummers. Zonder rij 1-op-1 |

Het live SEM gebruikt al de rekeningnummers van CASH. Kostenplaatsen worden niet meegestuurd: CASH vult ze zelf
in vanuit de grootboekrekening. Omgevingsvariabelen: zie `.env.example`.

## Statussen van facturen

| Status | Betekenis |
|---|---|
| `proef` | Omgezet in proefmodus, niet geboekt |
| `nieuw` | Boeking gestart, maar de uitkomst is onbekend. Controleer dit in CASH |
| `geboekt` | Geboekt in CASH (`cash_boeking_id`) |
| `fout` | Probleem of geweigerd door CASH. Zie `foutmelding` |
| `gewijzigd_na_boeking` | Gewijzigd in SEM nadat de factuur geboekt is. Handmatig afhandelen |

## SEM-API

- Documentatie: https://support.smarteventmanager.com/api/html/f7c1ff93-5b8d-58b2-9591-29eb62b8c1cb.htm
- `https://deuithof.smarteventmanager.com`, header `ApiKey: <key>`.
- Endpoints (POST; GET met body geeft HTTP 400):
  - `api/JournalEntryBatches/GetJournalEntryBatches`: `{ JournalEntryBatchFilter: { FromModifiedAt } }`
  - `api/JournalEntries/GetJournalEntries`: `{ JournalEntryFilter: { BatchNumber } }`
  - `api/Invoices/GetInvoices`: `{ InvoiceFilter: { BatchNumbers }, InvoiceLoadOptions }`
- De omgeving wordt gedeeld: houd het aantal aanroepen redelijk.

## CASH-API (REST 4.0)

- Swagger: https://www.cashweb.nl/api4.0/ · recordindeling: https://cash.nl/knowledge/recordindeling-cash-financieel
- `https://www.cashweb.nl/api/4.0`, header `Authorization: <API key>`. De key staat in CashWeb >
  Gebruikersoverzicht > API-gebruiker > tab **Api** (kopieer-icoon; **niet** op Genereer klikken).
- Een factuur gaat met `POST /import` als **record 301**-regels, elk als eigen element, die samen op nul sluiten:

  | Regel | F0201 grootboek | Overige velden | F0307 bedrag |
  |---|---|---|---|
  | Debiteur | uit de SEM-debiteurregel | F0101 relatienr, F0309 factuurnr | + totaal incl. btw |
  | Omzet (per regel) | SEM-grootboek | | − bedrag excl. btw |
  | Btw (per rekening) | SEM-btw-regel | | − btw-bedrag |

  Elke regel heeft F0901 dagboek, F0302 boekdatum (= factuurdatum, JJMMDD) en F0303 boekstuk (= factuurnummer).
  Bij een creditnota zijn de tekens omgekeerd. CASH weigert een boekstuknummer dat al bestaat: dubbel boeken kan niet.
- Antwoorden: `201` = verwerkt; `202` = Pending, nagevraagd via `GET /transaction/{id}`; `4xx` = geweigerd
  (status `fout`). Al het andere: uitkomst onbekend (status blijft `nieuw`).
- Veldlengtes: debiteur- en factuurnummer max. 6 cijfers, grootboek en dagboek max. 6 tekens, omschrijving 25 tekens.

## Beheer-routes (alleen met `Authorization: Bearer $CRON_SECRET`)

| Route | Doel |
|---|---|
| `GET /api/cron/sync` | De nachtelijke sync (ook door Vercel Cron aangeroepen) |
| `GET /api/cron/diagnose-config` | Waar de instellingen naar wijzen (geen geheimen) |
| `GET /api/cron/diagnose-sem?van=JJJJ-MM-DD[&batch=][&alles=1]` | Alleen lezen: SEM-batches en -journaalposten |
| `GET /api/cron/diagnose-cash?[admin=][&periode=JJPP\|JJPP&dagboek=&stuk=]` | Alleen lezen: CASH, incl. geboekte regels |
| `GET /api/cron/vergelijk?batch=[&dagboek=]` | Omzetting naast de boekingen in CASH, per rekening |
| `POST /api/cron/testboeking?batch=[&factuur=][&proef=1][&dagboek=]` | **Alleen demo:** één batch/factuur boeken of proefdraaien |
| `POST /api/cron/testdata-opruimen?facturen=` | **Alleen demo:** testfacturen uit de database halen |

## Beveiliging

- Keys en wachtwoorden staan alleen in de omgevingsvariabelen (Vercel / `.env.local`), nooit in de repo of in
  meldingen (ze worden gemaskeerd).
- Beheerpagina achter HTTP Basic Auth; beheer-routes achter `CRON_SECRET` (faalt dicht als dat ontbreekt).
- Echt boeken buiten `demo` vereist `CASH_LIVE_ADMINISTRATIE` gelijk aan `CASH_ADMINISTRATIE`.
- Supabase: RLS aan zonder policies; alleen de server (service role key) heeft toegang.

## Live zetten

1. Haal testfacturen uit de database (`testdata-opruimen`) zolang de administratie nog `demo` is.
2. Zet `start_factuurnummer` op het eerste nummer dat niet met de hand is geboekt.
3. Vercel: `CASH_ADMINISTRATIE=spo1`, `CASH_LIVE_ADMINISTRATIE=spo1`, `SYNC_DRY_RUN=false`, en redeploy.

## Lokaal ontwikkelen

```bash
npm install
cp .env.example .env.local   # vul de waarden in
npm test && npm run typecheck
npm run sem:verken -- 2026-09-01        # batches/journaalposten uit SEM (alleen lezen)
npm run cash:verken -- spo1             # dagboeken en grootboekrekeningen in CASH (alleen lezen)
npm run dev                             # beheerpagina op http://localhost:3000
```

Database: voer `supabase/migrations/*.sql` uit (`supabase db push` of de SQL-editor).
