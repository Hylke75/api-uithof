# Uithof Facturensync – Claude Code overdracht

## Direct gebruiken
1. Pak het ZIP-bestand uit in of naast de bestaande repository.
2. Open Claude Code in de root van de bestaande applicatie.
3. Geef de tekst uit `01-START-HIER-MASTERPROMPT.md` als opdracht en verwijs naar dit pakket. Geef Claude toegang tot de bestanden of plaats ze in de repo onder `design-brief/`.
4. Laat Claude de huidige code onderzoeken en de nieuwe UI implementeren zonder synchronisatie- of boekingslogica te wijzigen.
5. Controleer de uitgevoerde tests en vergelijk de nieuwe app met `referentie-ontwerp.png`.

## Inhoud
- `01-START-HIER-MASTERPROMPT.md`: uitvoeropdracht.
- `02-DESIGN-SYSTEM.md`: exacte UI-tokens en layoutregels.
- `03-PAGINAS-EN-COMPONENTEN.md`: alle routes, componenten, tabellen en toestanden.
- `04-TESTEN-EN-ACCEPTATIE.md`: functionele/security-checklist.
- `referentie-ontwerp.png`: visuele referentie, niet als bron van livegegevens gebruiken.

Belangrijk: dit is een uitvoerbaar ontwerpbriefingpakket voor een bestaande codebase, niet een broncode-drop-in. Claude moet bestaande repo, APIs en rechten eerst inspecteren. De visuele screenshot bevat voorbeeldwaarden die niet als echte backenddata mogen worden overgenomen.
