# IMPLEMENTATIE-, SECURITY- EN ACCEPTATIECHECKLIST

## Integratie
- [ ] Gebruik bestaande routes of implementeer redirects om bestaande bookmarks intact te houden.
- [ ] Hergebruik bestaande data fetching, auth, CSRF- en access controls.
- [ ] Geen nieuwe boekingsmutaties in read-only schermen.
- [ ] 'Verbindingen controleren' voert uitsluitend read-only checks uit.
- [ ] Sync-knop gebruikt alleen bestaand beveiligd endpoint, disabled zolang verzoek loopt.
- [ ] Geen uitgeschakelde proefmodus door UI-code, standaardinstellingen of migraties.
- [ ] Server-side configuratie bepaalt of boeken mogelijk is; UI-only blokkering is onvoldoende.
- [ ] Geen console logging van tokens, sleutels of volledige gevoelige responses.
- [ ] Onjuiste/afwezige Supabase key veroorzaakt zichtbare fout, geen groen statuslabel.
- [ ] Zonder API-data geen 0-waarden die op een succesvolle lege dataset lijken.

## UX en toegankelijkheid
- [ ] Duidelijke actieve navigatie.
- [ ] Keyboard tabbing, focus-ring, escape-sluiting van drawers/modals.
- [ ] Status niet alleen kleurafhankelijk.
- [ ] Labels bij filters, zoekvelden en buttons.
- [ ] Tabellen met header/thead/scope en praktische smalle-schermweergave.
- [ ] Verwerkingsfeedback niet alleen via tijdelijke toast.
- [ ] Foutbanner zichtbaar en niet verborgen onder topbar.
- [ ] Correcte EUR-valuta-/Nederlandse datumformattering waar data dat aangeeft.
- [ ] Loading, empty, unauthorized, timeout en server-error states.

## Testscenario's
1. Alle APIs bereikbaar, proefmodus aan: alle relevante verbindingen groen, amber modebanner, geen echte boeking mogelijk.
2. Supabase levert `Invalid API key`: Supabase rood; algemene systeemstatus 'Aandacht nodig'; statistieken niet gefingeerd; andere systeemchecks blijven zelfstandig zichtbaar.
3. CASH beschikbaar maar dagboek niet ingesteld: CASH bereikbaar, boekingsconfiguratie onvolledig, blokkade helder uitgelegd.
4. SEM 0 batches: correcte 0 alleen na geslaagde fetch; geen spookruns.
5. Facturen niet beschikbaar: foutstate in plaats van lege geslaagde tabel.
6. Sync mislukt of time-out: knop herstelt, foutfeedback persistent, geen dubbele sync.
7. Een gewijzigde factuur na boeking: duidelijke afwijkende status, geen ongevraagde herboeking.
8. Rechteloze gebruiker: geen acties uitvoeren of sleutel-/boekingsdetails onthullen.
9. 390px viewport: navigatie en tabellen bruikbaar zonder page-wide overflow.
10. 1440px viewport: gelijkwaardige visuele compositie met referentie.

## Acceptatie-uitvoer Claude Code
Geef een overzicht van implementatiebestanden, bestaande API-endpoints die zijn gebruikt, componentstructuur, gerealiseerde pagina's, resultaten van build/lint/tests, bewust ongewijzigde backend en eventuele openstaande blokkades. Als de backend momenteel defect is, moet de UI blijven functioneren in foutstatus; niet zelf API-sleutels vervangen of rapporteren dat het probleem opgelost is.
