# PAGINA'S, COMPONENTEN, INFORMATIEARCHITECTUUR

## 1. Overzicht (/ of bestaande dashboard route)
Bovenaan eyebrow 'INTEGRATIE', H1 'Uithof facturensync', uitleg 'Smart Event Manager → CASH' en twee acties: 'Sync nu starten' en 'Verbindingen controleren'. Toon cronritme 01:00 UTC alleen als ingesteld in bestaande configuratie; maak bij voorkeur de werkelijke tijdzone expliciet.

Boven de eerste grid: een amber proefmodusbanner als deze werkelijk actief is. Als databasefout actief is, een zichtbare rode foutbanner: 'Supabase-verbinding mislukt', veilig weergegeven details, laatste controle indien bekend, een knop 'Opnieuw controleren' (read-only) en een link naar instellingen indien passend.

Vier KPI-kaarten: 'Totaal facturen', 'In verwerking / proef', 'Geboekt', 'Fouten'. Alle waarden uit backend, no-data: '—' met uitleg in plaats van 0 als ophalen faalde. Elke kaart heeft icoon, label, groot getal, eventueel 'Bekijk facturen' route. De huidige situatie met API-key-fout moet dus streepjes en foutstatus kunnen tonen.

Sectie 'Verbindingen': 3 kaarten: Smart Event Manager, Supabase, CASH. Per kaart systeemnaam, statusicoon, expliciete status, laatst gecontroleerd alleen indien bekend, detailoptie. Backend 'health' en operationele readiness gescheiden beoordelen.

Onderste gedeelte 2 kolommen: links 'CASH administraties' met code, naam, alleen lezen; rechts 'CASH dagboeken' met code, naam, soort, rekening. Verder 'Grootboekrekeningen' als samenvatting met geconfigureerde debiteurenrekening (voorbeeld uit huidige UI: 1300) en totalen alleen uit backend, en 'Laatste runs' tabel met tijd, resultaat, facturen, batches en detail. Bij lange lijsten 'Bekijk alles', geen 567 rijen direct in dashboard.

## 2. Facturen
H1 'Facturen'; statusfilters die aansluiten bij huidige back-end: Alle, Proef (niet geboekt), Uitkomst onbekend, Geboekt, Fout, Gewijzigd na boeking. Toon aantallen alleen als betrouwbaar geladen; anders placeholder. Tabel: factuurnummer/ID, datum, omschrijving/relatie indien beschikbaar, bedrag + valuta indien beschikbaar, SEM-batch-ID, huidige status, laatste verwerkingsdatum, detail. Sorteer, zoek en pagineer als gegevensbron dit ondersteunt, anders client-side alleen op daadwerkelijk geladen dataset (duidelijk maken). Detailpaneel: bronfactuur, toegepaste mapping, voorgenomen CASH-boeking in proefmodus, technische fouten (zonder secrets), verwerkingstijdstippen. Nooit onbedoeld boekingsactie in detail.

## 3. Batches
H1 'Batches uit SEM'. Tabel: batch-ID, aanmaakdatum, wijzigingsdatum, factuuraantal indien bekend, status en detail. Detailpaneel met brondata, gerelateerde facturen, eventuele verwerkingsproblemen. 0 batches daadwerkelijk sinds 2026-10-01 in bestaande screenshot mag alleen getoond worden als die periode nog uit de backend komt.

## 4. Runs
H1 'Synchronisatieruns'. Tabel: gestart op, beëindigd op, resultaat, batches opgehaald, facturen verwerkt, geboekt, mislukt, trigger (gepland / handmatig), foutdetails. Leg onderscheid tussen 'API-check', 'sync uitgevoerd', 'proef', 'mislukt'. Geen geslaagde run tonen als de bron niet bereikbaar is. Details: stappen/tijdlijn met veilige technische meldingen.

## 5. Instellingen
H1 'Instellingen'. Secties: bron Smart Event Manager (URL, status, sleutel gemaskeerd), opslag Supabase (connectiviteit alleen, sleutel nooit in client tonen), doel CASH (administratiecode, dagboek, debiteurenrekening, relevante mapping), synchronisatieschema en proefmodus. Houd instellingen read-only tenzij bestaande backend geautoriseerde mutaties ondersteunt. Markeer 'verkoopdagboek nog niet ingesteld' duidelijk als configuratievereiste. Als 'demo' geselecteerd is, onderscheid administratienaam en code. Plaats opslag van geheimen alleen op server; geen onveilige key-edit-vormulieren.

## 6. Logboek
H1 'Logboek'. Filters: periode, level, bron en run-ID, indien beschikbaar. Tabel: tijd, severity, systeem/stap, bericht, context. Logberichten redigeren om secrets, tokens, credentials en persoonsdata niet onnodig te tonen. Fallback 'Logboek niet beschikbaar'.

## Componentenlijst
- AppShell, Sidebar, MobileNavDrawer, Topbar, PageHeader, Breadcrumbs
- ConnectionStatusBadge, ConnectionCard, SystemHealthSummary, ProcessFlow
- ModeBanner, ErrorBanner, EmptyState, LoadingSkeleton, InlineError, RetryButton
- KpiCard, StatGrid, SectionCard, DataTable, TableToolbar, SearchField, Filters, Pagination
- InvoiceStatusPill, InvoiceDetailDrawer, BatchDetailDrawer, RunDetailDrawer
- SettingsSummary, DefinitionList, CopyableId, ConfirmationDialog, Toast
- JournalTable, AdministrationTable, LedgerAccountSummary, RecentRunsTable

## Procesflow
Een compacte horizontale visualisatie op desktop en verticaal op mobiel: [Smart Event Manager] → [Supabase] → [CASH]. Per stap echte status. Gebruik tekst 'Proefmodus: geen boekingen' bij de laatste stap in proefmodus; niet stilzwijgend CASH als geboekt markeren. Stappen mogen niet als gegarandeerde implementatie-architectuur worden aangenomen: verifieer dat de actuele verwerking daadwerkelijk via Supabase loopt.

## Loading/error/no data
- Loading: skeletkaart en `aria-busy=true` zonder cijfers te laten flitsen.
- Fetch error: persistente foutmelding in sectie, cijfers niet op 0 zetten.
- Empty success: 'Geen facturen gevonden voor deze filters.'
- Geen verbinding: 'Gegevens niet beschikbaar. Controleer de API-verbinding.'
- Sync succes in proefmodus: 'Synchronisatie voltooid in proefmodus. Er is niets in CASH geboekt.' alleen wanneer API dat bevestigt.
- Sync mislukt: melding met veilige foutreden en run-ID indien aanwezig.
