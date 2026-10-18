-- Ontbrekende debiteuren automatisch als relatie in CASH aanmaken (gegevens uit SEM).
insert into public.instellingen (sleutel, waarde, omschrijving) values
  ('relaties_aanmaken', 'ja', 'ja = ontbrekende debiteuren met de klantgegevens uit SEM als relatie in CASH aanmaken vóór het boeken')
on conflict (sleutel) do update set waarde = excluded.waarde, omschrijving = excluded.omschrijving, updated_at = now();
