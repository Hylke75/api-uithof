-- Overstap: facturen t/m 823514 zijn met de hand in CASH geboekt; de koppeling begint bij 823515.
insert into public.instellingen (sleutel, waarde, omschrijving) values
  ('start_factuurnummer', '823515', 'Eerste factuurnummer voor de koppeling; t/m 823514 handmatig in CASH geboekt (Vanessa, okt 2026)')
on conflict (sleutel) do update set waarde = excluded.waarde, omschrijving = excluded.omschrijving, updated_at = now();
