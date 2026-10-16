-- Mails over de sync: dagelijkse samenvatting t/m melding_dagelijks_tot, foutmails altijd.
-- De Resend-sleutel staat als RESEND_API_KEY in Vercel (niet in de database).
insert into public.instellingen (sleutel, waarde, omschrijving) values
  ('melding_aan', 'hylke@linkandlead.nl', 'Ontvanger(s) van de mails over de sync, komma-gescheiden'),
  ('melding_dagelijks_tot', '2026-10-31', 'Tot en met deze datum elke nacht een samenvatting; foutmails altijd')
on conflict (sleutel) do update set waarde = excluded.waarde, omschrijving = excluded.omschrijving, updated_at = now();
