# Uithof facturensync (SEM → CASH)

Elke nacht worden facturen uit **Smart Event Manager (SEM)** opgehaald en in **CASH** geboekt.
Dit vervangt de handmatige batch-import.

- **Vercel** (Next.js/TypeScript): nachtelijke cron (`vercel.json`, 01:00 UTC) en een beheerpagina
- **Supabase**: logboek van runs, facturenhistorie en mappingtabellen
- **GitHub**: versiebeheer

> **Status:** de basisopzet staat. De koppelingen met SEM en CASH zijn nog *stubs*, en wachten op
> API-documentatie en toegang. De **proefmodus staat standaard aan**.

## Hoe een run werkt

1. Het venster bepalen: vanaf het einde van de vorige geslaagde run min 7 dagen (om laat ingevoerde
   facturen mee te nemen), maar nooit vóór `SYNC_START_DATE`. Bij de eerste run is dat `SYNC_START_DATE`.
2. Facturen uit SEM ophalen.
3. Per factuur:
   - **Al geboekt en ongewijzigd:** overslaan. Een factuur wordt nooit twee keer geboekt.
   - **Al geboekt, maar in SEM gewijzigd:** de status wordt `gewijzigd_na_boeking`, voor handmatige controle.
   - **Mapping ontbreekt** (omzetsoort of debiteur): de status wordt `fout`, met een melding. De volgende run probeert het opnieuw.
   - **Proefmodus:** de status wordt `proef`. De boeking die naar CASH *zou* gaan, wordt opgeslagen in `cash_payload`.
   - **Live:** eerst wordt de status `nieuw` vastgelegd, daarna wordt er geboekt in CASH, en dan wordt de status `geboekt`.
     Stopt een run halverwege, dan blijft de status `nieuw` staan en wordt de factuur **niet** automatisch opnieuw geboekt.
4. Het resultaat komt in `sync_runs`: `success`, `partial` (bij een of meer fouten) of `failed`.

## Statussen van facturen

| Status | Betekenis |
|---|---|
| `proef` | Gemapt in proefmodus, niet geboekt |
| `nieuw` | Boeking gestart, maar de uitkomst is onbekend. Controleer dit in CASH |
| `geboekt` | Geboekt in CASH (`cash_boeking_id`) |
| `fout` | Mapping- of CASH-fout. Zie `foutmelding` |
| `gewijzigd_na_boeking` | Gewijzigd in SEM nadat de factuur geboekt is. Handmatig afhandelen |

## Lokaal ontwikkelen

```bash
npm install
cp .env.example .env.local   # vul de waarden in
npm test                     # unit tests voor de sync-logica
npm run typecheck
npm run dev                  # beheerpagina op http://localhost:3000
```

Database: voer `supabase/migrations/*.sql` uit op het Supabase-project, met `supabase db push` of via de SQL-editor.

Handmatig een cron-run starten:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
```

## Beveiliging

- De beheerpagina zit achter HTTP Basic Auth (`ADMIN_USER` / `ADMIN_PASSWORD`).
- De cron-route accepteert alleen `Authorization: Bearer $CRON_SECRET`. Vercel stuurt die header automatisch mee.
- Supabase: RLS staat aan zonder policies. Alleen de server, met de service role key, heeft toegang.

## Naar live

1. Laat de parallel-run in proefmodus draaien. Vergelijk `cash_payload` met de handmatige import.
2. Laat de contactpersoon van De Uithof akkoord geven.
3. Stel `SYNC_START_DATE` in op de eerste factuurdatum die *niet* meer handmatig geïmporteerd wordt.
   Anders worden facturen dubbel geboekt.
4. Zet `SYNC_DRY_RUN=false` en `CASH_ADMINISTRATIE` op de productieadministratie.

## Bevindingen API's (2 oktober 2026)

### Smart Event Manager

- De documentatie staat op `support.smarteventmanager.com/api/...`. Die kunnen we vanuit de
  ontwikkelomgeving niet bereiken: het netwerkbeleid blokkeert het domein.
- Een oude open-source client (Opifer, 2014, API 8.1) laat dit zien: inloggen gaat met
  `POST /Api/Account/LogOn`, dat geeft een `SecurityToken` terug. Daarna stuurt elke aanroep
  header `SecurityToken` mee, met JSON naar `/Api/<Module>/<Actie>`. Facturen zitten niet in
  die client. Dit moeten we dus nog controleren tegen de actuele documentatie.
- **Bestaande boekhoudkoppelingen werken met batches.** Bij Databrydge (Exact/Twinfield) en
  Appconnex (AFAS) maakt iemand in SEM een batch aan. Die batch (debiteuren, journaalposten en
  facturen) wordt via de API opgehaald. Betalingen kunnen optioneel teruggeschreven worden, bij
  de volgende batch. Kostenplaats en kostendrager komen mee uit SEM.
  → Mogelijk is "batches ophalen" de juiste bron in plaats van "facturen op datum". Elke batch
  wordt dan precies één keer verwerkt, en dat voorkomt dubbele boekingen. Open vraag: kan een
  batch ook via de API *aangemaakt* worden, zodat het volledig automatisch gaat?

### CASH

- Het account `hylke@linkandlead.nl` (Sporttainment Center De Uithof B.V.) is een
  **API-gebruiker**, maar heeft nog **geen administratie gekoppeld**. Zonder koppeling geeft
  elke aanroep de fout `1002 Unauthorized Access`. Een beheerder van De Uithof (of de accountant)
  moet de administratie koppelen via Gebruikersbeheer.
- De rechten lopen via een API-gebruikerssjabloon op accountant- of bedrijfsniveau. Standaard
  staan alle rechten aan.
- **CASH API 3.0** is SOAP/XML met genummerde aanvragen en records (bijvoorbeeld 8502: de laatste
  wijzigingen in klanten). Er bestaat ook een **API 4.0 (REST)**. Die heeft de voorkeur als hij
  journaalposten en verkoopboekingen ondersteunt.
- Bij CASH-support opvragen: de WSDL en/of de REST-documentatie, plus de recordindeling voor
  verkoopboekingen/journaalposten en voor debiteuren.

De CASH-koppeling zit achter de interface `CashClient` (`src/lib/cash/client.ts`). Of het
SOAP of REST wordt, verandert dus niets aan de sync-logica.

## Openstaande punten

- [ ] Toegang tot de SEM-documentatie (domein toestaan in het netwerkbeleid, of de pagina's aanleveren)
- [ ] CASH: administratie van De Uithof koppelen aan de API-gebruiker
- [ ] CASH: WSDL / API 4.0-documentatie en recordindeling opvragen bij CASH-support
- [ ] SEM: verwerken we per batch of per factuur? Kan een batch via de API aangemaakt worden?
- [ ] Toegang: SEM-login, CASH-API-key, testadministratie in CASH
- [ ] Mapping: grootboekrekening en btw-code (en eventueel kostenplaats) per omzetsoort
- [ ] Strategie voor de koppeling van debiteuren (SEM-klant ↔ CASH-debiteurnummer; nieuwe debiteuren automatisch aanmaken?)
- [ ] Startdatum en eerste batch
- [ ] Wat zit er in een batch: facturen, creditnota's, proforma's? (Proforma's worden nu niet ondersteund)
- [ ] Moeten betalingen en afletteren mee?
- [ ] Kan SEM filteren op "gewijzigd sinds"? Dat is betrouwbaarder dan filteren op factuurdatum
- [ ] Ondersteunt CASH een duplicaatcontrole of idempotentiesleutel (bijvoorbeeld op factuurnummer)? Zo is een time-out veilig af te handelen
- [ ] Supabase-organisatie (kosten) en contactpersoon De Uithof voor de parallel-run
