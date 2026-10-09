-- Vertaling van de rekeningen uit de SEM-TESTomgeving (apidemo) naar CASH, voor testboekingen
-- in administratie "demo". Het live SEM van De Uithof gebruikt naar verwachting al CASH-nummers.
insert into public.map_grootboek (sem_grootboek, grootboekrekening, omschrijving, actief) values
  ('101095', '1300', 'SEM-testomgeving: debiteuren -> Debiteuren', true),
  ('123210', '8466', 'SEM-testomgeving: omzet hoog (Bacardi) -> Omzet Bar 21%', true),
  ('123215', '8465', 'SEM-testomgeving: omzet laag (Chocomelk) -> Omzet Bar 9%', true)
on conflict (sem_grootboek) do update set grootboekrekening = excluded.grootboekrekening, omschrijving = excluded.omschrijving, updated_at = now();

-- Kostenplaatsen uit SEM (4 tekens) passen niet in CASH (3 tekens): voorlopig weglaten.
insert into public.instellingen (sleutel, waarde, omschrijving) values
  ('kostenplaatsen', 'negeren', 'Kostenplaatsen uit SEM (4 tekens) passen niet in CASH (3 tekens); weglaten tot er een vertaling is'),
  ('cash_dagboek', 'VERKS', 'Verkoopfacturen Smart (soort U) in CASH')
on conflict (sleutel) do update set waarde = excluded.waarde, omschrijving = excluded.omschrijving, updated_at = now();

-- Batch 92 (factuur 14): omzetrekening Brasserie/Survival/Paintball (btw hoog), en een testdebiteur
-- die in CASH demo bestaat (SEM-testdebiteur 50246 bestaat daar niet).
insert into public.map_grootboek (sem_grootboek, grootboekrekening, omschrijving, actief) values
  ('122960', '8550', 'SEM-testomgeving: Brasserie/Survival/Paintball -> Omzet Evenementen BTW 21%', true)
on conflict (sem_grootboek) do update set grootboekrekening = excluded.grootboekrekening, omschrijving = excluded.omschrijving, updated_at = now();
insert into public.map_debiteur (sem_debiteurnummer, cash_debiteurnummer, naam) values
  ('50246', '69', 'SEM-testomgeving: testdebiteur -> bestaande relatie 69 in CASH demo')
on conflict (sem_debiteurnummer) do update set cash_debiteurnummer = excluded.cash_debiteurnummer, naam = excluded.naam, updated_at = now();
