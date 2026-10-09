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
-- (alleen tijdelijk; zie hieronder).
insert into public.map_grootboek (sem_grootboek, grootboekrekening, omschrijving, actief) values
  ('122960', '8550', 'SEM-testomgeving: Brasserie/Survival/Paintball -> Omzet Evenementen BTW 21%', true)
on conflict (sem_grootboek) do update set grootboekrekening = excluded.grootboekrekening, omschrijving = excluded.omschrijving, updated_at = now();
-- (Testdebiteur 50246 -> 69 is na de test weer verwijderd: het echte SEM heeft eigen debiteuren.)
