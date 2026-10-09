# DESIGN SYSTEM — UITHOF FACTURENSYNC

## Visueel concept
Een kalm, scherp, professioneel Nederlands B2B integratiedashboard. Witte achtergrond met koel-neutrale tinten, diep marineblauwe typografie, groen als actie- en succesaccent. Statuskleuren alleen wanneer ze functionele betekenis hebben. Geen gradients, glassmorphism of zware schaduwen. Geen 'random' illustraties of emoticons.

## Exacte tokens
Gebruik deze variabelen als single source of truth:

```css
:root {
  --font-ui: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --color-canvas: #F7F9FC;
  --color-surface: #FFFFFF;
  --color-ink: #101828;
  --color-ink-soft: #475467;
  --color-muted: #667085;
  --color-border: #E4E7EC;
  --color-border-strong: #D0D5DD;
  --color-navy: #182B56;
  --color-navy-hover: #233E77;
  --color-primary: #16852F;
  --color-primary-hover: #116C25;
  --color-primary-soft: #EAF7ED;
  --color-blue: #175CD3;
  --color-blue-soft: #EFF6FF;
  --color-warning: #B66A00;
  --color-warning-soft: #FFFAEB;
  --color-danger: #D92D20;
  --color-danger-soft: #FEF3F2;
  --color-success: #14843B;
  --color-success-soft: #ECFDF3;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --shadow-card: 0 2px 10px rgba(16,24,40,.035);
  --sidebar-width: 240px;
  --content-max-width: 1440px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
}
```

## Typografie
- Lettertype Inter; fallback system-ui (niet blokkeren als extern lettertype ontbreekt).
- H1: 32px / 40px / 700 / letterspatiëring -0.025em.
- H2: 20px / 28px / 700.
- H3 / kaarttitel: 16px / 24px / 650.
- Body: 14px / 22px / 400.
- Kleine toelichting: 13px / 20px / 400, kleur ink-soft.
- KPI-getallen: 26px / 32px / 700, tabular numbers.
- Tabellen: 13px / 20px, headers 12px / 18px / 650.
- Mobiel H1: 26px / 34px.

## App shell
- Desktop sidebar: 240px, wit, rechterrand 1px border, hele viewport hoogte, vaste of sticky layout.
- Logo linksboven: gestileerde donkerblauwe letter U (mag als simpele SVG/CSS, geen externe assets nodig); productnaam in twee regels.
- Sidebar menu: Overzicht, Facturen, Batches, Runs, Instellingen, Logboek. Lucide iconen 19px stroke 1.8.
- Actief menu: lichtgroene achtergrond, donkere tekst; indicator ook zonder kleur via duidelijk accent/weight.
- Linksonder statuspaneel 'Systeemstatus' gebaseerd op servercontrole; geen 'API online' als Supabase faalt.
- Topbar: titel en subtitel links; primaire en secundaire actie rechts; optionele gebruiker rechtsboven alleen als bestaande auth user beschikbaar is.
- Content area: padding 32px desktop / 20px tablet / 16px mobiel; max-width 1440px.
- Card: wit, border 1px solid #E4E7EC, 12-16px radius, subtiele shadow, padding 20px.
- Pagina verticale sectieafstand 20-24px; grid gutter 16px.

## Controls
- Primary button: 44px hoog, achtergrond #16852F, wit, radius 8px, padding 0 18px, semibold, plus play/refresh-icoon.
- Secondary button: 44px hoog, wit, rand #D0D5DD, tekst #101828.
- Destructive button: uitsluitend voor expliciet destructieve acties, nooit voor status bekijken.
- Input/select: 42px hoog, border #D0D5DD, radius 8px, focus 3px rgba(23,92,211,.20).
- Status pill: radius 999px, font 12px/18px/600, padding 3px 9px, icon optioneel. Varianten success/warning/danger/info/neutral. Label EN icoon, nooit uitsluitend kleur.
- Tabelrij: min-height 42px; hover #F9FAFB; actieve selectie met duidelijke tekst/outline.
- Tooltip alleen ondersteunend; informatie moet ook bereikbaar zijn per keyboard.
- Toast: rechtsboven, dismissal, rol status; kritieke fouten persistent in page alert.

## Statussystematiek
- healthy: groen met label 'Verbonden'.
- error: rood met label 'Verbinding mislukt' plus veilige foutomschrijving.
- warning: amber met label 'Aandacht nodig'.
- checking: blauw/neutraal met spinner en label 'Controleren'.
- unknown: grijs met label 'Niet gecontroleerd'.
- blocked: rood/amber afhankelijk van ernst met label 'Synchronisatie geblokkeerd'.
- proefmodus: amber permanente bovenste banner met tekst 'Proefmodus actief. Facturen worden verwerkt, maar NIET in CASH geboekt.' Alleen tonen als backend dit bevestigt.

## Responsiveness
- >=1280: 240px sidebar, 4 KPI's op een rij, verbindingskaarten 3 kolommen, details 2 kolommen.
- 768-1279: compacte/collapsible sidebar, KPI 2 kolommen, verbindingskaarten 1 of 2 kolommen afhankelijk ruimte, details 1 kolom.
- <768: sidebar als toegankelijk menu/drawer, KPI 1 kolom (eventueel 2 vanaf 520), alle overige kaarten 1 kolom; action buttons 100% breed op smalle displays; data tabellen horizontaal scrollbaar binnen kaart met duidelijke scrollbar of omschakelen op cards.
- Minimaal interactieve target 40x40px; liever 44x44px.

## Designprincipes
Geen nepdata, geen ongeverifieerde timestamps, geen groene overall status wanneer een kritiek subsysteem rood is. De grafische referentie toont voorbeeldstatussen en voorbeeldruns en is uitsluitend visuele inspiratie; de actuele API-respons is leidend.
