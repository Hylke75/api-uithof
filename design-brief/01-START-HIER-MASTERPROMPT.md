# CLAUDE CODE MASTERPROMPT — UITHOF FACTURENSYNC

Je bent senior frontend engineer, UX-designer en security-bewuste fullstack engineer. Implementeer de nieuwe UI van het bestaande Uithof Facturensync beheerpaneel. Werk in de BESTAANDE repository. Bestudeer eerst de architectuur, routes, componenten, bestaande endpoints, rechten, environment variables en tests. Gebruik het bijgevoegde ontwerp `referentie-ontwerp.png` als visuele inspiratie en volg `02-DESIGN-SYSTEM.md` als exacte specificatie. De screenshot is geen betrouwbare bron voor data of statussen.

## Niet onderhandelbaar
1. Dit is een UI-redesign, GEEN herbouw van synchronisatie of boekingslogica. Wijzig geen API-contracten, cronjobs, mappings, API-keys, database-schema's, authenticatie- of autorisatieregels zonder aantoonbare noodzaak en expliciete toestemming.
2. Behoud de bestaande proefmodus. Maak geen daadwerkelijke boekingen vanuit de nieuwe interface zolang de bestaande applicatie in proefmodus staat. Geen automatische overschakeling naar productie.
3. Respecteer de werkelijke serverdata en foutstatus. Screenshots tonen `Invalid API key` voor Supabase; toon dit waar van toepassing, niet gefingeerde groene status of succesvolle runs.
4. Geen echte API-sleutels of geheimen in broncode, client bundle, logs, screenshots of foutmeldingen. Gebruik server-side secrets; maskeer gevoelige data.
5. Neem alle bestaande werkende functies over. Voeg geen fictieve statistieken, tijdstippen of gegevens toe. Gebruik expliciete 'Geen gegevens'-staten.
6. Instellingen die boeking beïnvloeden alleen wijzigen via bestaande geautoriseerde backendflow en expliciete bevestiging.

## Uit te voeren stappen
1. Inventariseer framework, styling, routes, UI-componenten, API-calls, foutafhandeling, permissies en datamodellen. Maak een korte mapping van bestaande naar nieuwe pagina's.
2. Zet design tokens en gedeelde componenten op conform de design system specificatie. Gebruik bestaande UI-infrastructuur indien bruikbaar. Installeer alleen noodzakelijke dependencies.
3. Maak responsive app-shell, sidebar, topbar en de 6 pagina's uit `03-PAGINAS-EN-COMPONENTEN.md`.
4. Koppel alles aan de werkelijk aanwezige data/endpoints. Wat niet bestaat, markeer als niet beschikbaar; geen nepknoppen of verzonnen API's.
5. Bouw expliciete loading-, empty-, error- en successtaten. Houd afzonderlijke verbindingstatussen aan.
6. Integreer de bestaande 'Sync nu starten' actie met loading, dubbelklikpreventie, bevestiging indien relevant en terugkoppeling.
7. Integreer 'Verbindingen controleren' uitsluitend als read-only controle; er mogen geen facturen worden opgehaald voor boeking en geen boekingen plaatsvinden tijdens deze check.
8. Controleer keyboard-navigatie, semantische labels, focus, contrast, mobile layout en foutaankondigingen.
9. Voer bestaande tests, lint en build uit, voeg passende component-/integratietests toe en herstel regressies.
10. Rapporteer gewijzigde bestanden, gebruikte bestaande endpoints, uitgevoerde tests en openstaande punten. Rapporteer blokkades; verzin geen implementatie.

## Definitie van klaar
- Visuele overeenkomst met `referentie-ontwerp.png` en exacte tokens/layout uit specificatie.
- Geen verandering aan synchronisatie-, boekings-, mapping- en cronlogica.
- Supabase-fout blijft zichtbaar tot die daadwerkelijk is opgelost.
- Alle serveracties werken met bestaande auth/permissies en tonen echte resultaten.
- Desktop (1440/1280), tablet (768) en mobiel (390) bruikbaar zonder horizontale overflow.
- Geen ongebruikte knoppen of niet-werkende filters.
- Build, lint en tests succesvol of expliciet gedocumenteerd waarom niet.

Begin met inspectie en een kort implementatieplan, maar ga daarna direct door met de uitvoering. Vraag alleen om input bij een onomkeerbare of security-gevoelige wijziging of ontbrekend essentieel API-contract.
