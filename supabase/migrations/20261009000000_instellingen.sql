-- Boekhoudinstellingen die zonder deploy aan te passen zijn. Een gelijknamige
-- omgevingsvariabele in Vercel (hoofdletters) gaat voor.
create table public.instellingen (
  sleutel       text primary key,
  waarde        text not null,
  omschrijving  text,
  updated_at    timestamptz not null default now()
);
alter table public.instellingen enable row level security;

-- Opgegeven door De Uithof (9 oktober 2026).
insert into public.instellingen (sleutel, waarde, omschrijving) values
  ('cash_gb_debiteuren', '1300', 'Debiteurenrekening voor gewone facturen'),
  ('cash_gb_debiteuren_voorschot', '1320', 'Debiteurenrekening voor voorschotfacturen');

insert into public.map_btwcode (sem_btw_code, cash_btw_grootboek, omschrijving) values
  ('Hoog', '1701', 'Btw hoog (21%)'),
  ('Laag', '1702', 'Btw laag (9%)');
